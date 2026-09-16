import { and, eq, ne, or } from "drizzle-orm";
import { orm, schema } from "./db";
import { newSecret } from "./config";
import { startDeviceStatusMonitor } from "./device-status";
import { isHostReachable } from "./net/probe";
import type { Device } from "$lib/types";
import { MAC_ADDRESS_PATTERN, parseMacAddress } from "$lib/util";
import z from "zod";

export type DeviceRow = typeof schema.devices.$inferSelect;

/**
 * Resolvers for the subscribers that are currently parked, waiting for the device table to change.
 * Every subscriber is woken and dropped at once, so the set stays empty between mutations and
 * disconnected clients cannot accumulate in it.
 */
const deviceListeners = new Set<() => void>();

/** A promise that resolves the next time any device is added, changed or removed. */
export const deviceChanged = () => {
	const { promise, resolve } = Promise.withResolvers<void>();
	deviceListeners.add(resolve);
	return promise;
};

export const notifyDeviceChange = () => {
	for (const listener of deviceListeners) listener();
	deviceListeners.clear();
};

// Started once, on first module load, rather than per-request - it owns a single polling timer
// for the process's whole lifetime, and pushes a device-list update whenever a status flips.
startDeviceStatusMonitor(notifyDeviceChange);

/** Maps a row onto the client-facing shape, dropping the internal primary key. */
export const toDevice = (row: DeviceRow): Device => ({
	id: row.id,
	comment: row.comment ?? undefined,
	hostname: row.hostname ?? undefined,
	ip: row.ip ?? undefined,
	macAddress: row.macAddress ?? undefined,
	status: row.status,
	statusChangedAt: row.statusChangedAt ?? undefined,
	lastWokenAt: row.lastWokenAt ?? undefined,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

export const selectDeviceRows = () => orm.select().from(schema.devices).orderBy(schema.devices.createdAt);

export const selectDevices = async () => (await selectDeviceRows()).map(toDevice);

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

export const deviceInput = z.object({
	comment: optionalText(z.string()),
	hostname: optionalText(z.hostname("Must be a valid hostname, such as my-desktop.local.")),
	macAddress: optionalText(z.string().regex(MAC_ADDRESS_PATTERN, "Must be six hex pairs, such as 00:1a:2b:3c:4d:5e.")),
	ip: optionalText(z.union([z.ipv4(), z.ipv6()], "Must be a valid IPv4 or IPv6 address.")),
});

export type DeviceInput = z.infer<typeof deviceInput>;

/**
 * Maps validated input onto device columns. A field left blank becomes an explicit empty value
 * rather than `undefined`, because Drizzle omits `undefined` columns from an `UPDATE` entirely,
 * which would quietly keep the old value instead of clearing it.
 */
export const toDeviceColumns = (data: DeviceInput) => ({
	// `comment` is `NOT NULL DEFAULT ''`, so a blank one clears to the empty string, not `null`.
	comment: data.comment ?? "",
	hostname: data.hostname ?? null,
	ip: data.ip ?? null,
	// The schema already rejected malformed addresses, so the parse cannot fail here.
	macAddress: data.macAddress === undefined ? null : (parseMacAddress(data.macAddress) ?? null),
});

/**
 * Finds a device by any of the handles a caller might know it by - its id, its hostname, or its
 * MAC address in any of the accepted spellings.
 */
export const findDevice = async (identifier: string) => {
	const macAddress = parseMacAddress(identifier);

	const [device] = await orm
		.select()
		.from(schema.devices)
		.where(
			or(
				eq(schema.devices.id, identifier),
				eq(schema.devices.hostname, identifier),
				...(macAddress === undefined ? [] : [eq(schema.devices.macAddress, macAddress)]),
			),
		);

	return device;
};

type DeviceColumns = ReturnType<typeof toDeviceColumns>;

/**
 * The same columns with the fields the caller left out dropped entirely, so an update merges into
 * the stored device rather than replacing it. Drizzle omits `undefined` columns from an `UPDATE`,
 * which is exactly the "leave this one alone" behaviour a merge wants.
 */
export const toPartialDeviceColumns = (data: DeviceInput) => {
	const columns: Partial<DeviceColumns> = toDeviceColumns(data);
	for (const key of Object.keys(columns) as (keyof DeviceColumns)[]) {
		if (data[key] === undefined) delete columns[key];
	}

	return columns;
};

/** Raised when a write would give two devices the same hostname, IP or MAC address. */
export class DeviceConflict extends Error {}

/** The columns a device is identified by, named the way someone reading the message would say it. */
const UNIQUE_COLUMN_LABELS: Record<string, string> = {
	hostname: "hostname",
	ip: "IP address",
	mac_address: "MAC address",
};

/**
 * SQLite reports a duplicate as `UNIQUE constraint failed: devices.<column>`, which is accurate but
 * not something to show anyone. Recognised collisions become a `DeviceConflict`; anything else is a
 * genuine fault and is left to propagate untouched.
 */
const withConflicts = async <Result>(write: () => Promise<Result>) => {
	try {
		return await write();
	} catch (error) {
		const [, column] = /UNIQUE constraint failed: devices\.(\w+)/.exec(String((error as Error)?.cause ?? error)) ?? [];
		const label = column === undefined ? undefined : UNIQUE_COLUMN_LABELS[column];
		if (label === undefined) throw error;

		throw new DeviceConflict(`Another device already uses that ${label}.`);
	}
};

export const insertDevice = async (data: DeviceInput) => {
	const [device] = await withConflicts(() =>
		orm
			.insert(schema.devices)
			.values({ id: newSecret(), ...toDeviceColumns(data) })
			.returning(),
	);

	notifyDeviceChange();
	return device;
};

/**
 * Returns the updated row, or `undefined` if the device was removed in the meantime. `merge` keeps
 * the fields the caller left out; without it the data given describes the device in full.
 */
export const updateDeviceById = async (id: string, data: DeviceInput, { merge = false } = {}) => {
	const columns = merge ? toPartialDeviceColumns(data) : toDeviceColumns(data);

	const [device] = await withConflicts(() =>
		orm
			.update(schema.devices)
			.set({ ...columns, updatedAt: new Date() })
			.where(eq(schema.devices.id, id))
			.returning(),
	);

	if (device) notifyDeviceChange();
	return device;
};

/** Drops the device's row. Returns `undefined` if it was already gone. */
export const deleteDeviceById = async (id: string) => {
	const [device] = await orm.delete(schema.devices).where(eq(schema.devices.id, id)).returning();

	if (device) notifyDeviceChange();
	return device;
};

export const markDeviceWoken = async (id: string) => {
	await orm.update(schema.devices).set({ lastWokenAt: new Date() }).where(eq(schema.devices.id, id));
	notifyDeviceChange();
};

/**
 * Records that a device was seen answering, so the list reflects a confirmed wake immediately
 * rather than at the next sweep of the background monitor. Only writes when the status actually
 * flips, keeping `statusChangedAt` meaning "when it came up" rather than "when it was last looked
 * at".
 */
export const markDeviceOnline = async (id: string) => {
	const [device] = await orm
		.update(schema.devices)
		.set({ status: "online", statusChangedAt: new Date() })
		.where(and(eq(schema.devices.id, id), ne(schema.devices.status, "online")))
		.returning();

	if (device) notifyDeviceChange();
	return device;
};

/**
 * Polls a device until it answers, so a caller can treat the response as "it's actually up" rather
 * than "a packet went out". Resolves `false` if it never answers within `timeoutMs`.
 */
export const waitUntilReachable = async (ip: string, { timeoutMs = 60_000, intervalMs = 2_000 } = {}) => {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		if (await isHostReachable(ip)) return true;
		if (Date.now() >= deadline) return false;
		await Bun.sleep(intervalMs);
	}
};
