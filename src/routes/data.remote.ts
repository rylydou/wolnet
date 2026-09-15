import { form, query } from "$app/server";
import { invalid } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { orm, schema } from "$lib/server/db";
import { newSecret } from "$lib/server/config";
import { startDeviceStatusMonitor } from "$lib/server/device-status";
import { sendMagicPacket } from "$lib/server/wol";
import type { Device } from "$lib/types";
import { MAC_ADDRESS_PATTERN, parseMacAddress } from "$lib/util";
import z from "zod";

/**
 * Resolvers for the `getDevices` subscribers that are currently parked, waiting for the device
 * table to change. Every subscriber is woken and dropped at once, so the set stays empty between
 * mutations and disconnected clients cannot accumulate in it.
 */
const deviceListeners = new Set<() => void>();

/** A promise that resolves the next time any device is added, changed or removed. */
const deviceChanged = () => {
	const { promise, resolve } = Promise.withResolvers<void>();
	deviceListeners.add(resolve);
	return promise;
};

const notifyDeviceChange = () => {
	for (const listener of deviceListeners) listener();
	deviceListeners.clear();
};

// Started once, on first module load, rather than per-request - it owns a single polling timer
// for the process's whole lifetime, and pushes a device-list update whenever a status flips.
startDeviceStatusMonitor(notifyDeviceChange);

/** Maps a row onto the client-facing shape, dropping the internal primary key. */
const toDevice = (row: typeof schema.devices.$inferSelect): Device => ({
	id: row.id,
	name: row.name,
	hostname: row.hostname ?? undefined,
	ip: row.ip ?? undefined,
	macAddress: row.macAddress ?? undefined,
	status: row.status,
	statusChangedAt: row.statusChangedAt ?? undefined,
	lastWokenAt: row.lastWokenAt ?? undefined,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

const selectDevices = async () => {
	const rows = await orm
		.select()
		.from(schema.devices)
		.where(isNull(schema.devices.deletedAt))
		.orderBy(schema.devices.name);

	return rows.map(toDevice);
};

export const getDevices = query.live(async function* () {
	while (true) {
		// Subscribe before reading, so a device added while the read is in flight still wakes us.
		const changed = deviceChanged();
		yield await selectDevices();
		await changed;
	}
});

/**
 * Blank text inputs submit `""` rather than being omitted, so treat that as "not provided"
 * instead of running it through `schema` and reporting it as malformed.
 */
const optionalText = <Schema extends z.ZodType<unknown, string>>(schema: Schema) =>
	z
		.string()
		.optional()
		.transform((value) => value?.trim() || undefined)
		.pipe(schema.optional());

const deviceInput = z.object({
	name: z.string().trim().min(1, "A device name is required."),
	hostname: optionalText(z.hostname("Must be a valid hostname, such as my-desktop.local.")),
	macAddress: optionalText(z.string().regex(MAC_ADDRESS_PATTERN, "Must be six hex pairs, such as 00:1a:2b:3c:4d:5e.")),
	ip: optionalText(z.union([z.ipv4(), z.ipv6()], "Must be a valid IPv4 or IPv6 address.")),
});

/**
 * Maps validated input onto device columns. A field left blank becomes an explicit `null` rather
 * than `undefined`, because Drizzle omits `undefined` columns from an `UPDATE` entirely, which
 * would quietly keep the old value instead of clearing it.
 */
const toDeviceColumns = (data: z.infer<typeof deviceInput>) => ({
	name: data.name,
	hostname: data.hostname ?? null,
	ip: data.ip ?? null,
	// The schema already rejected malformed addresses, so the parse cannot fail here.
	macAddress: data.macAddress === undefined ? null : (parseMacAddress(data.macAddress) ?? null),
});

export const createDevice = form(deviceInput, async (data) => {
	await orm.insert(schema.devices).values({ id: newSecret(), ...toDeviceColumns(data) });

	// Pushes the new row to every open `getDevices` stream.
	notifyDeviceChange();
});

export const updateDevice = form(deviceInput.extend({ id: z.string().nonempty() }), async ({ id, ...data }) => {
	const [updated] = await orm
		.update(schema.devices)
		.set({ ...toDeviceColumns(data), updatedAt: new Date() })
		.where(and(eq(schema.devices.id, id), isNull(schema.devices.deletedAt)))
		.returning({ id: schema.devices.id });

	// The device may have been removed between the list being rendered and this submission.
	if (!updated) invalid("That device no longer exists.");

	notifyDeviceChange();
});

export const wakeDevice = form(z.object({ id: z.string().nonempty() }), async ({ id }) => {
	const [device] = await orm
		.select({ macAddress: schema.devices.macAddress })
		.from(schema.devices)
		.where(and(eq(schema.devices.id, id), isNull(schema.devices.deletedAt)));

	if (!device) invalid("That device no longer exists.");
	if (device.macAddress == null) invalid("This device has no MAC address set, so it can't be woken.");

	try {
		await sendMagicPacket(device.macAddress);
	} catch (error) {
		console.error(`Failed to send Wake-on-LAN packet for device ${id}:`, error);
		invalid("Could not send the wake packet. Check the server logs for details.");
	}

	await orm.update(schema.devices).set({ lastWokenAt: new Date() }).where(eq(schema.devices.id, id));

	notifyDeviceChange();
});
