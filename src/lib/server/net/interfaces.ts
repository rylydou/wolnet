/**
 * The IPv4 networks this machine is plugged into. Only devices on these can be found by ARP and
 * woken by Wake-on-LAN.
 */

import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

export type LocalSubnet = {
	/** The network interface, like `eth0`. */
	interfaceName: string;
	/** Like `10.10.1.0/24`. */
	cidr: string;
	/** The first and last address in the subnet, as numbers. */
	network: number;
	broadcast: number;
};

/**
 * Subnets bigger than this (a /22) are skipped. Scanning sends one packet per address, and a
 * subnet that big is almost always a VPN or container network.
 */
const MAX_HOSTS = 1024;

export const ipv4ToInt = (address: string) =>
	address.split(".").reduce((value, octet) => value * 0x100 + Number(octet), 0);

export const intToIpv4 = (value: number) =>
	[0x1000000, 0x10000, 0x100, 1].map((divisor) => Math.floor(value / divisor) % 0x100).join(".");

/**
 * The network interfaces with a default route, like `eth0`. That's the real network: the one magic
 * packets go out on. Other interfaces are usually Docker or VM networks.
 */
const defaultRouteInterfaces = () => {
	try {
		// Columns: Iface, Destination, Gateway, ... A destination of 00000000 is the default route.
		const routes = readFileSync("/proc/net/route", "utf8").split("\n").slice(1);
		return new Set(
			routes.map((line) => line.trim().split(/\s+/)).flatMap(([name, to]) => (to === "00000000" ? [name!] : [])),
		);
	} catch {
		return new Set<string>();
	}
};

/**
 * Every subnet worth scanning: the ones on interfaces with a default route, or every one if none
 * has one. Skips loopback, and single-address subnets (/31 and /32, which VPNs like Tailscale use)
 * since there's nothing else on them.
 */
export const localSubnets = (): LocalSubnet[] => {
	const routed = defaultRouteInterfaces();
	return Object.entries(networkInterfaces()).flatMap(([interfaceName, addresses]) =>
		(addresses ?? []).flatMap((entry) => {
			if (routed.size > 0 && !routed.has(interfaceName)) return [];
			if (entry.internal || entry.family !== "IPv4" || !entry.cidr) return [];

			const prefix = Number(entry.cidr.split("/")[1]);
			const size = 2 ** (32 - prefix);
			if (size <= 2 || size - 2 > MAX_HOSTS) return [];

			const network = ipv4ToInt(entry.address) - (ipv4ToInt(entry.address) % size);
			return [{ interfaceName, cidr: `${intToIpv4(network)}/${prefix}`, network, broadcast: network + size - 1 }];
		}),
	);
};

/** The local subnet an address is on, if any. */
export const subnetOf = (address: string, subnets = localSubnets()) => {
	const value = ipv4ToInt(address);
	return subnets.find((subnet) => value > subnet.network && value < subnet.broadcast);
};

/** Every IPv4 address this machine has, so scans can leave it out. */
export const localAddresses = () =>
	new Set(
		Object.values(networkInterfaces())
			.flatMap((entries) => entries ?? [])
			.filter((entry) => entry.family === "IPv4")
			.map((entry) => entry.address),
	);

/** Every usable address in a subnet (not the network or broadcast address). */
export function* hostAddresses(subnet: LocalSubnet) {
	for (let value = subnet.network + 1; value < subnet.broadcast; value++) yield intToIpv4(value);
}
