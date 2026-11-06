import { command, form, getRequestEvent, query } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import z from "zod";
import * as devices from "#lib/server/devices.ts";
import { scanNetwork } from "#lib/server/discovery.ts";
import { nextChange } from "#lib/server/events.ts";
import { wake } from "#lib/server/wake.ts";
import { deviceLabel } from "#lib/types.ts";

/** The device list. Sends a new copy whenever anything changes, including a device going on or off. */
export const getDevices = query.live(async function* () {
	while (true) {
		// Start listening before reading, so a change during the read isn't missed.
		const changed = nextChange();
		yield await devices.list();
		await changed;
	}
});

/** Scans the network. Takes a few seconds, so it only runs when the scan window asks for it. */
export const discoverDevices = query(scanNetwork);

/** Shows problems the user can fix, like a taken hostname, on the form. */
const tryChange = async <Result>(change: () => Promise<Result>) => {
	try {
		return await change();
	} catch (cause) {
		if (cause instanceof devices.DeviceError) invalid(cause.message);
		throw cause;
	}
};

export const addDevice = form(devices.deviceInput, async (input) => {
	await tryChange(() => devices.add(input));
});

export const editDevice = form(devices.deviceInput.extend({ id: z.string() }), async ({ id, ...input }) => {
	if (!(await tryChange(() => devices.edit(id, input)))) invalid("That device was removed.");
});

export const removeDevice = command(z.string(), async (id) => {
	if (!(await devices.remove(id))) error(404, "That device was already removed.");
});

/** Sends a wake signal. The device list then shows the device as waking until it's on. */
export const wakeDevice = command(z.string(), async (id) => {
	const row = await devices.get(id);
	if (!row) error(404, "That device was removed.");
	if (row.macAddress === null) error(400, "This device has no MAC address, so it can't be woken.");

	const label = deviceLabel(devices.toDevice(row));
	const from = `the web page at ${getRequestEvent()
		.getClientAddress()
		.replace(/^::ffff:/, "")}`;
	const result = await wake({ id, ip: row.ip, macAddress: row.macAddress, label }, { from });
	return result.alreadyOnline ? "alreadyOnline" : "waking";
});
