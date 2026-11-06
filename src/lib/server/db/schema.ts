import { integer, snakeCase, text } from "drizzle-orm/sqlite-core";

const timestamp = () => integer({ mode: "timestamp" });

export const devices = snakeCase.table("devices", {
	index: integer().primaryKey(),
	createdAt: timestamp()
		.notNull()
		.$default(() => new Date()),
	updatedAt: timestamp()
		.notNull()
		.$default(() => new Date()),

	/** The id used in URLs. Random, so it never changes when the device does. */
	id: text().notNull().unique(),
	/** What to call the device, like "Living Room TV". */
	name: text(),
	hostname: text().unique(),
	/** IPv4 or IPv6. */
	ip: text().unique(),
	/** The 6 bytes of the MAC address packed into one number. See `#lib/mac.ts`. */
	macAddress: integer().unique(),

	lastWokenAt: timestamp(),
});

export type DeviceRow = typeof devices.$inferSelect;
