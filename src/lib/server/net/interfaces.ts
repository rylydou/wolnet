/**
 * Describes the IPv4 networks this machine is actually attached to, which is what bounds a scan:
 * only addresses on a directly-connected subnet can be resolved to a MAC address, and a MAC address
 * is the one field Wake-on-LAN cannot work without.
 */

import { networkInterfaces } from "node:os";

export type LocalSubnet = {
	/** The interface the subnet is reachable through, e.g. `eth0`. */
	interfaceName: string;
	/** This machine's own address on the subnet. */
	address: string;
	/** Network prefix length, e.g. 24 for a 255.255.255.0 netmask. */
	prefix: number;
	/** Directed broadcast address for the subnet, e.g. `192.168.1.255`. */
	broadcast: string;
	/** Number of usable host addresses, excluding the network and broadcast addresses. */
	hostCount: number;
};

/**
 * A sweep sends one packet per host address, so the ceiling is really about how long a scan takes
 * rather than memory. A /22 fits comfortably; anything wider is almost certainly a VPN or container
 * network where a host-by-host sweep would be pointless as well as slow.
 */
export const MAX_SWEEP_HOSTS = 1024;

export const ipv4ToInt = (address: string) =>
	address.split(".").reduce((value, octet) => value * 0x100 + Number(octet), 0);

export const intToIpv4 = (value: number) =>
	[0x1000000, 0x10000, 0x100, 1].map((divisor) => Math.floor(value / divisor) % 0x100).join(".");

/** A netmask is a run of set bits, so its prefix length is just how many bits are set. */
const prefixFromNetmask = (netmask: string) => {
	let prefix = 0;
	for (const octet of netmask.split(".")) {
		for (let bit = 7; bit >= 0; bit--) if ((Number(octet) >> bit) & 1) prefix++;
	}
	return prefix;
};

const IPV4_BITS = 32;

/**
 * Every directly-connected IPv4 subnet worth sweeping. Loopback and point-to-point addresses (a /31
 * or /32, as handed out by VPNs like Tailscale) are dropped because they contain no other hosts to
 * find, and subnets wider than `MAX_SWEEP_HOSTS` are dropped because sweeping them is impractical.
 */
export const localSubnets = (): LocalSubnet[] => {
	const subnets: LocalSubnet[] = [];

	for (const [interfaceName, addresses] of Object.entries(networkInterfaces())) {
		for (const entry of addresses ?? []) {
			// Node reports the family as `"IPv4"`, but has used the number `4` in the past.
			if (entry.internal || (entry.family !== "IPv4" && (entry.family as unknown) !== 4)) continue;

			const prefix = prefixFromNetmask(entry.netmask);
			const hostCount = prefix >= IPV4_BITS - 1 ? 0 : 2 ** (IPV4_BITS - prefix) - 2;
			if (hostCount === 0 || hostCount > MAX_SWEEP_HOSTS) continue;

			const network = ipv4ToInt(entry.address) - (ipv4ToInt(entry.address) % 2 ** (IPV4_BITS - prefix));

			subnets.push({
				interfaceName,
				address: entry.address,
				prefix,
				broadcast: intToIpv4(network + hostCount + 1),
				hostCount,
			});
		}
	}

	return subnets;
};

/** Every IPv4 address this machine holds, so a scan can leave the server itself out of its results. */
export const localAddresses = () => {
	const addresses = new Set<string>();
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? [])
			if (entry.family === "IPv4" || (entry.family as unknown) === 4) addresses.add(entry.address);
	}
	return addresses;
};

/** Walks the usable host addresses of a subnet, skipping the network and broadcast addresses. */
export function* hostAddresses(subnet: LocalSubnet) {
	const broadcast = ipv4ToInt(subnet.broadcast);
	for (let value = broadcast - subnet.hostCount; value < broadcast; value++) yield intToIpv4(value);
}

/** Whether an address falls inside the subnet, used to keep foreign neighbour entries out of a scan. */
export const subnetContains = (subnet: LocalSubnet, address: string) => {
	const broadcast = ipv4ToInt(subnet.broadcast);
	const value = ipv4ToInt(address);
	return value > broadcast - subnet.hostCount - 1 && value < broadcast;
};
