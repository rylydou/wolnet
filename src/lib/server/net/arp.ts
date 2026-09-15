/**
 * Reads the kernel's ARP / neighbour table, which is the only source in a scan that yields MAC
 * addresses. Neither mDNS nor SSDP carries one, and without a MAC address a discovered host cannot
 * be woken - so this is the backbone of discovery and the other protocols only decorate it.
 */

import { readFileSync } from "node:fs";
import { parseMacAddress } from "$lib/util";

export type Neighbour = {
	ip: string;
	macAddress: number;
	/** The interface the neighbour was seen on, e.g. `eth0`. */
	interfaceName?: string;
};

/** An entry with an all-zero MAC is an unresolved placeholder, not a device that answered. */
const UNRESOLVED_MAC = 0;

/** `ATF_COM`, the flag the kernel sets on a neighbour entry once the MAC address is resolved. */
const ARP_FLAG_COMPLETE = 0x2;

/**
 * Parses `/proc/net/arp`, whose columns are
 * `IP address / HW type / Flags / HW address / Mask / Device`.
 */
const parseProcNetArp = (contents: string): Neighbour[] => {
	const neighbours: Neighbour[] = [];

	// The first line is the column header rather than an entry.
	for (const line of contents.split("\n").slice(1)) {
		const [ip, , flags, hardwareAddress, , interfaceName] = line.trim().split(/\s+/);
		if (!ip || !hardwareAddress) continue;
		if ((Number(flags) & ARP_FLAG_COMPLETE) === 0) continue;

		const macAddress = parseMacAddress(hardwareAddress);
		if (macAddress === undefined || macAddress === UNRESOLVED_MAC) continue;

		neighbours.push({ ip, macAddress, interfaceName });
	}

	return neighbours;
};

/** Parses `ip neigh show` output, e.g. `192.168.1.5 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE`. */
const parseIpNeigh = (contents: string): Neighbour[] => {
	const neighbours: Neighbour[] = [];

	for (const line of contents.split("\n")) {
		const fields = line.trim().split(/\s+/);
		const [ip] = fields;
		const lladdrIndex = fields.indexOf("lladdr");
		if (!ip || lladdrIndex === -1) continue;

		// `FAILED` and `INCOMPLETE` entries are hosts that never answered, so they aren't devices.
		if (fields.includes("FAILED") || fields.includes("INCOMPLETE")) continue;

		const macAddress = parseMacAddress(fields[lladdrIndex + 1] ?? "");
		if (macAddress === undefined || macAddress === UNRESOLVED_MAC) continue;

		const devIndex = fields.indexOf("dev");
		neighbours.push({ ip, macAddress, interfaceName: devIndex === -1 ? undefined : fields[devIndex + 1] });
	}

	return neighbours;
};

const runIpNeigh = async () => {
	const process = Bun.spawn(["ip", "-4", "neigh", "show"], { stdout: "pipe", stderr: "ignore" });
	const [contents] = await Promise.all([new Response(process.stdout).text(), process.exited]);
	return process.exitCode === 0 ? contents : "";
};

/**
 * Every resolved IPv4 neighbour the kernel currently knows about. `/proc/net/arp` is preferred
 * because it needs no subprocess, with `ip neigh` as a fallback for kernels that don't expose it.
 * A scan is best-effort, so a host that can read neither simply finds nothing rather than failing.
 */
export const readNeighbours = async (): Promise<Neighbour[]> => {
	try {
		// Read synchronously via `node:fs` rather than `Bun.file`. Files under `/proc` report a size
		// of zero, and a reader that trusts `stat` hands back an empty string for a table that is
		// actually full - which looks exactly like a network with no devices on it.
		const contents = readFileSync("/proc/net/arp", "utf8");
		if (contents) return parseProcNetArp(contents);
	} catch {
		// Fall through to `ip neigh`, which may still work where the procfs entry is missing.
	}

	try {
		return parseIpNeigh(await runIpNeigh());
	} catch {
		return [];
	}
};
