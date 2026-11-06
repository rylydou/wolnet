/**
 * Reads the kernel's ARP table (`/proc/net/arp`): the IP and MAC address of every device this
 * machine has talked to lately. It's the only place a network scan can learn MAC addresses.
 *
 * Entries stay in the table for a while after a device leaves, so being in it doesn't mean a
 * device is on right now. `net/presence.ts` checks that with `arping`.
 */

import { readFileSync } from "node:fs";
import { parseMacAddress } from "#lib/mac.ts";

export type Neighbour = { ip: string; macAddress: number };

/** The flag the kernel sets once it knows an entry's MAC address. */
const ARP_FLAG_COMPLETE = 0x2;

export const readNeighbours = (): Neighbour[] => {
	let contents;
	try {
		// Read with `node:fs`, not `Bun.file`. Files in `/proc` report a size of 0, so `Bun.file`
		// reads them as empty.
		contents = readFileSync("/proc/net/arp", "utf8");
	} catch {
		return [];
	}

	const neighbours: Neighbour[] = [];

	// Columns: IP address, HW type, Flags, HW address, Mask, Device. The first line is the header.
	for (const line of contents.split("\n").slice(1)) {
		const [ip, , flags, hardwareAddress] = line.trim().split(/\s+/);
		if (!ip || !hardwareAddress || (Number(flags) & ARP_FLAG_COMPLETE) === 0) continue;

		const macAddress = parseMacAddress(hardwareAddress);
		if (macAddress) neighbours.push({ ip, macAddress });
	}

	return neighbours;
};
