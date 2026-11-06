/**
 * Keeps track of which devices are on, by checking every device every few seconds. This is the
 * only place that decides whether a device is on, so the web UI, the API, and the logs always agree.
 *
 * One check can be wrong (see `net/presence.ts`), so a device only switches between on and off
 * after 2 checks in a row agree. Every switch is logged with the reason, and so are single checks
 * that disagree, so a flaky device shows up in the logs.
 *
 * It also watches devices that were just sent a wake signal. Those show as `waking` until they come
 * online, or until the wait runs out. While anything is waking, checks run every 2 seconds instead
 * of every 10, so a device shows as on soon after it boots.
 */

import { formatMacAddress } from "#lib/mac.ts";
import type { DeviceStatus } from "#lib/types.ts";
import { orm, schema } from "./db/index.ts";
import { notifyChange } from "./events.ts";
import { log } from "./log.ts";
import { type Address, type CheckResult, check, sweep } from "./net/presence.ts";

/** How long a device shows as waking before WolNet gives up on it. */
export const WAKE_TIMEOUT_MS = 2 * 60_000;

const CHECK_EVERY_MS = 10_000;
const CHECK_EVERY_WHILE_WAKING_MS = 2_000;

/** How many checks in a row have to agree before a device switches between on and off. */
const CHECKS_TO_SWITCH = 2;

/**
 * How often to sweep the network for devices with only a MAC address on record (see
 * `net/presence.ts`). A sweep takes about 4 seconds, so it's rare unless one of them is waking.
 */
const SWEEP_EVERY_MS = 5 * 60_000;
const SWEEP_EVERY_WHILE_WAKING_MS = 15_000;

type Status = {
	online: boolean;
	/** How many checks in a row disagreed with `online`. */
	doubts: number;
};

/** By device id. A woken device that isn't on the list uses `mac:<number>`. */
const statuses = new Map<string, Status>();

type Wake = {
	address: Address;
	label: string;
	startedAt: number;
	until: number;
	done: PromiseWithResolvers<boolean>;
};

/** Devices waiting to come online, keyed like `statuses`. */
const wakes = new Map<string, Wake>();

let lastSweepAt = 0;
/** Set while waiting between checks. Unset while a check is running. */
let timer: ReturnType<typeof setTimeout> | undefined;
/** Set when `checkSoon` was called during a check, so another one runs right after it. */
let checkAgain = false;
let stopped = false;

export const statusOf = (key: string): DeviceStatus =>
	wakes.has(key) ? "waking" : statuses.get(key)?.online ? "online" : "offline";

/** Forgets what's known about a device, like after its address changes, so the next check decides. */
export const forgetStatus = (key: string) => statuses.delete(key);

/**
 * Shows a device as waking until it comes online. Resolves `true` once it's on, or `false` if it
 * isn't on within `timeoutMs`.
 */
export const watchWake = (key: string, address: Address, label: string, timeoutMs = WAKE_TIMEOUT_MS) => {
	const until = Date.now() + timeoutMs;

	let wake = wakes.get(key);
	if (wake) {
		// Already waking from an earlier request. Keep showing it until the later of the two times.
		wake.until = Math.max(wake.until, until);
	} else {
		wake = { address, label, startedAt: Date.now(), until, done: Promise.withResolvers() };
		wakes.set(key, wake);
		// A device nothing is known about yet starts as off, so it still needs 2 checks to count as on.
		if (!statuses.has(key)) statuses.set(key, { online: false, doubts: 0 });
		notifyChange();
		checkSoon(CHECK_EVERY_WHILE_WAKING_MS);
	}

	// `unref` so a pending wait doesn't keep the server from shutting down.
	const timedOut = new Promise<false>((resolve) => setTimeout(resolve, timeoutMs, false).unref());
	return Promise.race([wake.done.promise, timedOut]);
};

const onOff = (online: boolean) => (online ? "on" : "off");

/** Records a check. Returns `true` if the device switched between on and off. */
const record = (key: string, label: string, result: CheckResult) => {
	const status = statuses.get(key);

	if (!status) {
		statuses.set(key, { online: result.online, doubts: 0 });
		log(`${label} is ${onOff(result.online)}: ${result.detail}`);
		return true;
	}

	if (status.online === result.online) {
		status.doubts = 0;
		return false;
	}

	status.doubts++;
	if (status.doubts < CHECKS_TO_SWITCH) {
		log(
			`${label} looked ${onOff(result.online)} for one check, so it still shows as ${onOff(status.online)}: ${result.detail}`,
		);
		return false;
	}

	statuses.set(key, { online: result.online, doubts: 0 });
	log(`${label} is now ${onOff(result.online)}: ${result.detail}`);
	return true;
};

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

const checkAll = async () => {
	const devices = await orm.select().from(schema.devices);

	type Target = Address & { label: string };
	const targets = new Map<string, Target>();

	for (const device of devices) {
		const mac = device.macAddress === null ? undefined : formatMacAddress(device.macAddress);
		targets.set(device.id, { ...device, label: device.name ?? device.hostname ?? device.ip ?? mac ?? device.id });
	}

	// Woken devices that aren't on the list.
	for (const [key, wake] of wakes) if (!targets.has(key)) targets.set(key, { ...wake.address, label: wake.label });

	const needSweep = [...targets].filter(([, target]) => target.ip === null && target.macAddress !== null);
	const sweepEvery = needSweep.some(([key]) => wakes.has(key)) ? SWEEP_EVERY_WHILE_WAKING_MS : SWEEP_EVERY_MS;
	if (needSweep.length > 0 && Date.now() - lastSweepAt >= sweepEvery) {
		lastSweepAt = Date.now();
		await sweep();
	}

	const results = await Promise.all([...targets].map(async ([key, target]) => [key, await check(target)] as const));

	let changed = false;
	for (const [key, result] of results) {
		if (record(key, targets.get(key)!.label, result)) changed = true;
	}

	// Forget removed devices, and woken devices that aren't on the list once their wake is over.
	for (const key of statuses.keys()) if (!targets.has(key) && !wakes.has(key)) statuses.delete(key);

	for (const [key, wake] of wakes) {
		const awake = statuses.get(key)?.online === true;
		if (!awake && Date.now() < wake.until) continue;

		const waited = seconds(Date.now() - wake.startedAt);
		log(awake ? `${wake.label} is awake, after ${waited}` : `${wake.label} didn't come online within ${waited}`);

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
