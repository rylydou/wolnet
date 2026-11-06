/**
 * Keeps track of which devices are on, by checking every device every few seconds.
 *
 * It also watches devices that were just sent a wake signal. Those show as `waking` until they come
 * online, or until the wait runs out. While anything is waking, checks run every 2 seconds instead
 * of every 10, so a device shows as on soon after it boots.
 */

import type { DeviceStatus } from "#lib/types.ts";
import { orm, schema } from "./db/index.ts";
import { notifyChange } from "./events.ts";
import { type Address, isOnline, sweep } from "./net/presence.ts";

/** How long a device shows as waking before WolNet gives up on it. */
export const WAKE_TIMEOUT_MS = 2 * 60_000;

const CHECK_EVERY_MS = 10_000;
const CHECK_EVERY_WHILE_WAKING_MS = 2_000;

/**
 * How often to sweep the network for devices with only a MAC address on record (see
 * `net/presence.ts`). A sweep takes about 4 seconds, so it's rare unless one of them is waking.
 */
const SWEEP_EVERY_MS = 5 * 60_000;
const SWEEP_EVERY_WHILE_WAKING_MS = 15_000;

/** Whether each device was on at the last check, by device id. */
const online = new Map<string, boolean>();

type Wake = { address: Address; until: number; done: PromiseWithResolvers<boolean> };

/** Devices waiting to come online, by device id. A device that isn't on the list uses its MAC address. */
const wakes = new Map<string, Wake>();

let lastSweepAt = 0;
/** Set while waiting between checks. Unset while a check is running. */
let timer: ReturnType<typeof setTimeout> | undefined;
/** Set when `checkSoon` was called during a check, so another one runs right after it. */
let checkAgain = false;
let stopped = false;

export const statusOf = (id: string): DeviceStatus =>
	wakes.has(id) ? "waking" : online.get(id) ? "online" : "offline";

/** Records that a device was just seen on, so the list doesn't have to wait for the next check. */
export const markOnline = (id: string) => {
	if (online.get(id)) return;
	online.set(id, true);
	notifyChange();
};

/**
 * Shows a device as waking until it comes online. Resolves `true` once it's on, or `false` if it
 * isn't on within `timeoutMs`.
 */
export const watchWake = (key: string, address: Address, timeoutMs = WAKE_TIMEOUT_MS) => {
	const until = Date.now() + timeoutMs;

	let wake = wakes.get(key);
	if (wake) {
		// Already waking from an earlier request. Keep showing it until the later of the two times.
		wake.until = Math.max(wake.until, until);
	} else {
		wake = { address, until, done: Promise.withResolvers() };
		wakes.set(key, wake);
		notifyChange();
		checkSoon(CHECK_EVERY_WHILE_WAKING_MS);
	}

	// `unref` so a pending wait doesn't keep the server from shutting down.
	const timedOut = new Promise<false>((resolve) => setTimeout(resolve, timeoutMs, false).unref());
	return Promise.race([wake.done.promise, timedOut]);
};

const checkAll = async () => {
	const devices = await orm
		.select({ id: schema.devices.id, ip: schema.devices.ip, macAddress: schema.devices.macAddress })
		.from(schema.devices);

	// Every device on the list, plus woken devices that aren't on it.
	const targets = new Map<string, Address>(devices.map((device) => [device.id, device]));
	for (const [key, wake] of wakes) if (!targets.has(key)) targets.set(key, wake.address);

	const needSweep = [...targets].filter(([, address]) => address.ip === null && address.macAddress !== null);
	const sweepEvery = needSweep.some(([key]) => wakes.has(key)) ? SWEEP_EVERY_WHILE_WAKING_MS : SWEEP_EVERY_MS;
	if (needSweep.length > 0 && Date.now() - lastSweepAt >= sweepEvery) {
		lastSweepAt = Date.now();
		await sweep();
	}

	const results = new Map(
		await Promise.all([...targets].map(async ([key, address]) => [key, await isOnline(address)] as const)),
	);

	let changed = false;

	for (const { id } of devices) {
		if (online.get(id) === results.get(id)) continue;
		online.set(id, results.get(id)!);
		changed = true;
	}

	for (const id of online.keys()) if (!targets.has(id)) online.delete(id);

	for (const [key, wake] of wakes) {
		// Skip wakes that started while this check was running.
		if (!results.has(key)) continue;

		const awake = results.get(key)!;
		if (!awake && Date.now() < wake.until) continue;

		wakes.delete(key);
		wake.done.resolve(awake);
		changed = true;
	}

	if (changed) notifyChange();
};

const loop = async () => {
	timer = undefined;

	try {
		await checkAll();
	} catch (error) {
		console.error("Checking device status failed:", error);
	}

	if (stopped) return;

	const delay = checkAgain ? 0 : wakes.size > 0 ? CHECK_EVERY_WHILE_WAKING_MS : CHECK_EVERY_MS;
	checkAgain = false;
	timer = setTimeout(loop, delay);
};

/** Runs the next check sooner, like after a device is added. */
export const checkSoon = (delayMs = 0) => {
	if (!timer) {
		checkAgain = delayMs === 0;
		return;
	}

	clearTimeout(timer);
	timer = setTimeout(loop, delayMs);
};

/** Starts checking devices. Called once, when the server starts (see `hooks.server.ts`). */
export const startStatusChecks = () => {
	timer ??= setTimeout(loop, 0);
};

/** Stops checking, so the server can exit. */
export const stopStatusChecks = () => {
	stopped = true;
	clearTimeout(timer);
};
