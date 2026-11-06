/** The device list: reading, adding, editing, and removing devices. */

import { eq, or } from "drizzle-orm";
import z from "zod";
import { formatMacAddress, MAC_ADDRESS_PATTERN, parseMacAddress } from "#lib/mac.ts";
import type { Device } from "#lib/types.ts";
import { orm, schema } from "./db/index.ts";
import type { DeviceRow } from "./db/schema.ts";
import { notifyChange } from "./events.ts";
import { checkSoon, statusOf } from "./status.ts";

export type { DeviceRow };

const { devices } = schema;

/** A problem with the request that the user can fix, like a hostname that's already taken. */
export class DeviceError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 404 | 409 = 400,
	) {
		super(message);
	}
}

/**
 * A text field. Blank (`""`) means "clear it" and becomes `null`. Leaving it out means "don't
 * change it" and stays `undefined`. Web forms always send every field, so saving a form replaces
 * the whole device, while an API call only changes the fields it includes.
 */
const field = <Output>(schema: z.ZodType<Output, string>) =>
	z
		.string()
		.trim()
		.transform((value) => value || null)
		.pipe(schema.nullable())
		.optional();

export const deviceInput = z.object({
	name: field(z.string().max(100, "Must be 100 characters or less.")),
	hostname: field(z.hostname("Must be a hostname, like my-desktop.local.")),
	macAddress: field(
		z
			.string()
			.regex(MAC_ADDRESS_PATTERN, "Must be 6 pairs of hex digits, like 00:1a:2b:3c:4d:5e.")
			.transform((value) => parseMacAddress(value)!),
	),
	ip: field(z.union([z.ipv4(), z.ipv6()], "Must be an IPv4 or IPv6 address.")),
});

export type DeviceInput = z.infer<typeof deviceInput>;

export const toDevice = (row: DeviceRow): Device => ({
	id: row.id,
	name: row.name ?? undefined,
	hostname: row.hostname ?? undefined,
	ip: row.ip ?? undefined,
	macAddress: row.macAddress === null ? undefined : formatMacAddress(row.macAddress),
	status: statusOf(row.id),
	lastWokenAt: row.lastWokenAt ?? undefined,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

/** Every device, oldest first. */
export const list = async () => (await orm.select().from(devices).orderBy(devices.createdAt)).map(toDevice);

export const get = async (id: string) => (await orm.select().from(devices).where(eq(devices.id, id)))[0];

/** Finds a device by its id, hostname, IP address, or MAC address. */
export const find = async (handle: string) => {
	const macAddress = parseMacAddress(handle);

	const [row] = await orm
		.select()
		.from(devices)
		.where(
			or(
				eq(devices.id, handle),
				eq(devices.hostname, handle),
				eq(devices.ip, handle),
				macAddress === undefined ? undefined : eq(devices.macAddress, macAddress),
			),
		);

	return row;
};

/** Random ids, like `k3x9q0m2a7bz`. */
const newId = () => {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
	return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => alphabet[byte % alphabet.length]).join("");
};

const COLUMN_LABELS: Record<string, string> = { hostname: "hostname", ip: "IP address", mac_address: "MAC address" };

/** Runs a write, and turns "UNIQUE constraint failed" into a message a person can act on. */
const write = async <Result>(run: () => Promise<Result>) => {
	try {
		return await run();
	} catch (error) {
		const [, column] = /UNIQUE constraint failed: devices\.(\w+)/.exec(String((error as Error).cause ?? error)) ?? [];
		if (!column || !COLUMN_LABELS[column]) throw error;

		throw new DeviceError(`Another device already has that ${COLUMN_LABELS[column]}.`, 409);
	}
};

const requireAddress = (device: Pick<DeviceRow, "hostname" | "ip" | "macAddress">) => {
	if (!device.hostname && !device.ip && device.macAddress === null) {
		throw new DeviceError("A device needs a hostname, MAC address, or IP address.");
	}
};

export const add = async (input: DeviceInput) => {
	const values = {
		id: newId(),
		name: input.name ?? null,
		hostname: input.hostname ?? null,
		ip: input.ip ?? null,
		macAddress: input.macAddress ?? null,
	};
	requireAddress(values);

	const [row] = await write(() => orm.insert(devices).values(values).returning());
	notifyChange();
	checkSoon();
	return row!;
};

/** Changes the fields given in `input`. Returns `undefined` if the device doesn't exist. */
export const edit = async (id: string, input: DeviceInput) => {
	const existing = await get(id);
	if (!existing) return undefined;

	// Fields that weren't given (`undefined`) keep their value. Drizzle leaves them out of the update.
	const given = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
	requireAddress({ ...existing, ...given });

	const [row] = await write(() =>
		orm
			.update(devices)
			.set({ ...input, updatedAt: new Date() })
			.where(eq(devices.id, id))
			.returning(),
	);
	notifyChange();
	checkSoon();
	return row;
};

/** Returns the removed device, or `undefined` if it didn't exist. */
export const remove = async (id: string) => {
	const [row] = await orm.delete(devices).where(eq(devices.id, id)).returning();
	if (row) notifyChange();
	return row;
};

export const markWoken = async (id: string) => {
	await orm.update(devices).set({ lastWokenAt: new Date() }).where(eq(devices.id, id));
};
