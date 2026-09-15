import * as t from ".";
import * as d from "./shared";

export const devices = d.table(
	"devices",
	{
		index: d.id(),
		createdAt: d
			.timestamp()
			.notNull()
			.$default(() => new Date()),
		updatedAt: d
			.timestamp()
			.notNull()
			.$default(() => new Date()),

		id: d.text().notNull().unique(),
		hostname: d.text().unique(),
		ip: d.text().unique(), // Can be either IPv4 or IPv6
		macAddress: d.integer().unique(), // 6 byte unsigned integer representing the MAC address
		comment: d.text().notNull().default(""),

		status: d
			.text({ enum: ["online", "offline"] })
			.notNull()
			.default("offline"),
		statusChangedAt: d.timestamp(),
		lastWokenAt: d.timestamp(),
	},
	(table) => [
		d.index("id").on(table.id),
		d.index("hostname").on(table.hostname),
		d.index("ip").on(table.ip),
		d.index("macAddress").on(table.macAddress),
	],
);
