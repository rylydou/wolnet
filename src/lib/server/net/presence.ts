/**
 * Answers "is this MAC address on the network right now", which is the check a device with no IP
 * address needs - and the more reliable one even for a device that has one.
 *
 * It works the way `arping` does, one layer below everything else: send a throwaway packet towards
 * the device, and let the kernel's ARP resolution do the asking. A device that is up answers ARP
 * whether or not it runs a single service, whether or not its firewall drops every port a probe
 * would try, and whether or not it replies to ping - because an IPv4 stack that stops answering ARP
 * stops working. The answer lands in the kernel's neighbour table, so all this module does is poke
 * the right addresses and then read that table back.
 *
 * The catch is that ARP is addressed by IP, so a MAC address has to be turned into one first. Three
 * sources cover that, cheapest first: the caller's hint (where the device was last seen), the
 * neighbour table itself (which the kernel also fills in passively, from DHCP renewals and the
 * gratuitous ARP a device broadcasts when it joins), and - only when neither has an answer - a full
 * subnet sweep, which is the one way to place a MAC address that has never been seen before.
 *
 * Two things ARP cannot see, both of which the IP probe in `net/probe` covers instead. It does not
 * cross a router, so a device on another network is invisible to it - a property of the protocol
 * rather than a limitation here, and one Wake-on-LAN shares. And a machine keeps no neighbour entry
 * for itself, so the server never finds its own MAC address this way.
 */

import { readNeighbours } from "./arp";
import { localSubnets } from "./interfaces";
import { sweepSubnets, touchAddresses } from "./sweep";

export type LocateOptions = {
	/** Where each MAC address was last seen, so a known device is placed without a sweep. */
	hints?: ReadonlyMap<number, string>;
	/**
	 * Whether to sweep every local subnet rather than only poking the addresses already associated
	 * with the wanted MAC addresses. It is the only way to place a MAC address nothing has seen yet,
	 * and it costs a few seconds of UDP, so callers that poll leave it off most rounds.
	 */
	sweep?: boolean;
};

/**
 * Finds which address each of the given MAC addresses is currently answering at. A MAC address
 * missing from the result is one that did not answer - which, on the local network, means it is
 * offline. The addresses that come back make good `hints` for the next call.
 */
export const locateMacAddresses = async (
	macAddresses: Iterable<number>,
	{ hints, sweep = false }: LocateOptions = {},
) => {
	const wanted = new Set(macAddresses);
	const located = new Map<number, string>();
	if (wanted.size === 0) return located;

	// Addresses worth poking: wherever the caller last saw the device, plus wherever the neighbour
	// table has it now. Poking a cached address is what makes the kernel revalidate the entry, so a
	// device that has since left stops being reported as present.
	const candidates = new Set<string>();
	for (const macAddress of wanted) {
		const hint = hints?.get(macAddress);
		if (hint !== undefined) candidates.add(hint);
	}
	for (const neighbour of await readNeighbours()) {
		if (wanted.has(neighbour.macAddress)) candidates.add(neighbour.ip);
	}

	if (sweep) await sweepSubnets(localSubnets());
	else await touchAddresses(candidates);

	for (const neighbour of await readNeighbours()) {
		if (wanted.has(neighbour.macAddress)) located.set(neighbour.macAddress, neighbour.ip);
	}

	return located;
};

/** Whether the device with this MAC address is currently answering on the local network. */
export const isMacOnline = async (macAddress: number, options?: LocateOptions) =>
	(await locateMacAddresses([macAddress], options)).size > 0;
