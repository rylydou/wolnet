import * as t from ".";
import * as d from "./shared";

d.table("devices", {
	index: d.id(),
	id: d.text().notNull(),
	ipv4: d.integer(),
	ipv6: d.text(),
	macAddress: d.integer(),
});
