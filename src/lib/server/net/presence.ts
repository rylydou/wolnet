/**
 * Answers "is this device on right now?"
 *
 * On the local network, WolNet asks the device directly with ARP (see `net/arping.ts`). That works
 * even if the device blocks ping and every port, and it checks the MAC address that answers, so a
 * device whose old IP address now belongs to something else isn't counted as on.
 *
 * ARP is addressed by IP, so a device with only a MAC address on record needs an IP to try first.
 * Those come from where it was last seen, and from the kernel's ARP table. If neither has one, a
 * `sweep()` of the whole network fills the ARP table. That takes a few seconds, so callers decide
 * when it's worth it.
 *
 * Devices on other networks can't be reached by ARP, so for those WolNet tries to open a TCP
 * connection instead (see `net/probe.ts`).
 */

import { readNeighbours } from "./arp.ts";
import { arping, ArpingError } from "./arping.ts";
import { localSubnets, subnetOf } from "./interfaces.ts";
import { isHostReachable } from "./probe.ts";

export { sweep } from "./sweep.ts";

export type Address = { ip: string | null; macAddress: number | null };

/** The IP address each MAC address last answered at. */
const lastSeenAt = new Map<number, string>();

/** Set once `arping` fails to run, so the problem is only logged once. */
let arpingError: ArpingError | undefined;

/** Whether the device at `ip` is on. If `macAddress` is given, it has to be the one that answers. */
const answers = async (ip: string, macAddress: number | null) => {
	const subnet = subnetOf(ip, localSubnets());
	if (!subnet || arpingError) return isHostReachable(ip);

	try {
		const answeredBy = await arping(ip, subnet.interfaceName);
		if (answeredBy === undefined || (macAddress !== null && answeredBy !== macAddress)) return false;

		if (macAddress !== null) lastSeenAt.set(macAddress, ip);
		return true;
	} catch (error) {
		if (!(error instanceof ArpingError)) throw error;

		arpingError = error;
		console.error(`${error.message} Falling back to TCP checks, which miss devices that block every port.`);
		return isHostReachable(ip);
	}
};

/** Whether the device is on right now. Takes about a second when it isn't. */
export const isOnline = async ({ ip, macAddress }: Address) => {
	const candidates = new Set<string>();
	if (ip) candidates.add(ip);

	if (macAddress !== null) {
		const lastSeen = lastSeenAt.get(macAddress);
		if (lastSeen) candidates.add(lastSeen);

		for (const neighbour of readNeighbours()) {
			if (neighbour.macAddress === macAddress) candidates.add(neighbour.ip);
		}
	}

	for (const candidate of candidates) {
		if (await answers(candidate, macAddress)) return true;
	}

	return false;
};
