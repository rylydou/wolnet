import { eq } from "drizzle-orm";
import { isHostReachable } from "./net/probe";
import { locateMacAddresses } from "./net/presence";
import { orm, schema } from "./db";

const POLL_INTERVAL_MS = 15_000;

/**
 * How often the monitor may fall back to sweeping the whole subnet. A sweep is the only way to
 * place a MAC address that has never been seen, but it costs a few seconds of UDP, so it runs
 * rarely and only while some device is still unplaced - once a device has been found, poking the
 * one address it was found at is enough to keep checking it.
 */
const SWEEP_INTERVAL_MS = 5 * 60_000;

let started = false;
let lastSweepAt = 0;

/**
 * Where each MAC address was last seen, carried between polls so a device that has been placed once
 * is checked by poking that single address rather than by sweeping the subnet again. Entries are
 * kept even when the device stops answering - an address a device held before is by far the most
 * likely place to find it when it comes back - and are corrected by the next sweep if its lease
 * moved in the meantime.
 */
const macLocations = new Map<number, string>();

/**
 * Probes every device for reachability and persists the result as `status` / `statusChangedAt`,
 * only writing rows whose status actually flipped so a steady device doesn't get a write (and a
 * spurious `statusChangedAt` bump) on every poll. Calls `onChange` whenever any row was actually
 * updated, so subscribers can be woken.
 *
 * A device is looked for by MAC address first, since answering ARP is not optional on a working
 * IPv4 stack: that finds devices with no IP address on record, and devices that are up but firewall
 * off every port. Probing the IP address is only the fallback, for a device ARP cannot see - one on
 * the far side of a router, which is beyond what Wake-on-LAN reaches anyway.
 */
const poll = async (onChange: () => void) => {
	const devices = await orm
		.select({
			id: schema.devices.id,
			ip: schema.devices.ip,
			macAddress: schema.devices.macAddress,
			status: schema.devices.status,
		})
		.from(schema.devices);

	const macAddresses = devices.map((device) => device.macAddress).filter((mac) => mac !== null);

	// Sweeping only helps for a MAC address with no known address, and even then not often enough to
	// be worth the traffic on every poll.
	const sweep = macAddresses.some((mac) => !macLocations.has(mac)) && Date.now() - lastSweepAt >= SWEEP_INTERVAL_MS;
	if (sweep) lastSweepAt = Date.now();

	const located = await locateMacAddresses(macAddresses, { hints: macLocations, sweep });
	for (const [macAddress, ip] of located) macLocations.set(macAddress, ip);

	const results = await Promise.all(
		devices.map(async (device) => {
			// The IP probe is the fallback rather than the first move: it is the slower of the two, and
			// it only adds anything for a device that ARP cannot reach - one on the far side of a router.
			const online =
				(device.macAddress !== null && located.has(device.macAddress)) ||
				(device.ip !== null && (await isHostReachable(device.ip)));

			return {
				id: device.id,
				previousStatus: device.status,
				status: (online ? "online" : "offline") as (typeof schema.devices.$inferSelect)["status"],
			};
		}),
	);

	const changedDevices = results.filter(({ status, previousStatus }) => status !== previousStatus);
	if (changedDevices.length === 0) return;

	const now = new Date();
	for (const { id, status } of changedDevices) {
		await orm.update(schema.devices).set({ status, statusChangedAt: now }).where(eq(schema.devices.id, id));
	}

	onChange();
};

/**
 * Starts polling every device for reachability and calls `onChange` whenever any device's
 * persisted status flips. Idempotent - only the first call actually starts the timer, since the
 * dev server can re-evaluate this module without a process restart.
 */
export const startDeviceStatusMonitor = (onChange: () => void) => {
	if (started) return;
	started = true;

	void poll(onChange);
	setInterval(() => void poll(onChange), POLL_INTERVAL_MS);
};
