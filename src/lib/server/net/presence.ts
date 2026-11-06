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
 *
 * One check can be wrong. Devices on Wi-Fi miss some ARP requests, and some sleeping devices still
 * answer now and then. `status.ts` waits for checks to agree before believing them.
 */

import { formatMacAddress } from "#lib/mac.ts";
import { readNeighbours } from "./arp.ts";
import { arping, ArpingError } from "./arping.ts";
import { subnetOf } from "./interfaces.ts";
import { isHostReachable } from "./probe.ts";

export { sweep } from "./sweep.ts";

export type Address = { ip: string | null; macAddress: number | null };

/** Whether a device answered, and how, in words for the logs. */
export type CheckResult = { online: boolean; detail: string };

/** The IP address each MAC address last answered at. */
const lastSeenAt = new Map<number, string>();

/** Set once `arping` fails to run, so the problem is only logged once. */
let arpingError: ArpingError | undefined;

const checkTcp = async (ip: string): Promise<CheckResult> =>
	(await isHostReachable(ip))
		? { online: true, detail: `${ip} answered over TCP` }
		: { online: false, detail: `no TCP answer from ${ip}` };

/** Checks one IP address. If `macAddress` is given, it has to be the one that answers. */
const checkIp = async (ip: string, macAddress: number | null): Promise<CheckResult> => {
	const subnet = subnetOf(ip);
	if (!subnet || arpingError) return checkTcp(ip);

	let reply;
	try {
		reply = await arping(ip, subnet.interfaceName);
	} catch (error) {
		if (!(error instanceof ArpingError)) throw error;

		arpingError = error;
		console.error(`${error.message} Falling back to TCP checks, which miss devices that block every port.`);
		return checkTcp(ip);
	}

	if (!reply) return { online: false, detail: `no ARP answer from ${ip}` };
	if (macAddress !== null && reply.macAddress !== macAddress) {
		return { online: false, detail: `${ip} is now ${formatMacAddress(reply.macAddress)}, a different device` };
	}

	if (macAddress !== null) lastSeenAt.set(macAddress, ip);
	return { online: true, detail: `${ip} answered ARP in ${Math.round(reply.ms)} ms` };
};

/** Checks whether a device is on right now. Takes about a second when it isn't. */
export const check = async ({ ip, macAddress }: Address): Promise<CheckResult> => {
	const candidates = new Set<string>();
	if (ip) candidates.add(ip);

	if (macAddress !== null) {
		const lastSeen = lastSeenAt.get(macAddress);
		if (lastSeen) candidates.add(lastSeen);

		for (const neighbour of readNeighbours()) {
			if (neighbour.macAddress === macAddress) candidates.add(neighbour.ip);
		}
	}

	if (candidates.size === 0) return { online: false, detail: "no IP address to check yet" };

	const misses: string[] = [];
	for (const candidate of candidates) {
		const result = await checkIp(candidate, macAddress);
		if (result.online) return result;
		misses.push(result.detail);
	}

	return { online: false, detail: misses.join(", ") };
};
