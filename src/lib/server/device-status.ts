import { eq } from "drizzle-orm";
import { isHostReachable } from "./net/probe";
import { orm, schema } from "./db";

const POLL_INTERVAL_MS = 15_000;

let started = false;

/**
 * Probes every device for reachability (a device with no IP address can never be found online) and
 * persists the result as `status` / `statusChangedAt`, only writing rows whose status actually
 * flipped so a steady device doesn't get a write (and a spurious `statusChangedAt` bump) on every
 * poll. Calls `onChange` whenever any row was actually updated, so subscribers can be woken.
 */
const poll = async (onChange: () => void) => {
	const devices = await orm
		.select({ id: schema.devices.id, ip: schema.devices.ip, status: schema.devices.status })
		.from(schema.devices);

	const results = await Promise.all(
		devices.map(async (device) => ({
			id: device.id,
			previousStatus: device.status,
			status: (device.ip && (await isHostReachable(device.ip))
				? "online"
				: "offline") as (typeof schema.devices.$inferSelect)["status"],
		})),
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
