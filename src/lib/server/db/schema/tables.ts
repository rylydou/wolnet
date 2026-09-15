import { title } from "node:process";
import * as t from ".";
import * as d from "./shared";

export const devices = d.table("devices", {
	index: d.id(),
	createdAt: d
		.timestamp()
		.notNull()
		.$default(() => new Date()),
	updatedAt: d
		.timestamp()
		.notNull()
		.$default(() => new Date()),
	deletedAt: d.timestamp(),

	id: d.text().notNull(),
	name: d.text().notNull(),
	hostname: d.text(),
	ip: d.text(), // Can be either IPv4 or IPv6
	macAddress: d.integer(), // 6 byte unsigned integer representing the MAC address

	status: d
		.text({ enum: ["online", "offline"] })
		.notNull()
		.default("offline"),
	statusChangedAt: d.timestamp(),
	lastWokenAt: d.timestamp(),
});
