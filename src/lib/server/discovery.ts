/**
 * Finds devices on the local network by combining three sources, because no single one gives the
 * whole picture:
 *
 * - An **ARP sweep** is the backbone. It is the only source that yields a MAC address, which is the
 *   one field Wake-on-LAN cannot work without, and it sees every device with a working IPv4 stack -
 *   including the ones that run no services and answer no port scan.
 * - **mDNS** turns an address into the name the device calls itself, e.g. `living-room-pi.local`.
 * - **SSDP/UPnP** contributes the name a person gave the device, e.g. "Living Room TV", which makes
 *   a far better comment than an address does.
 *
 * Results are keyed by IP address, which is what all three have in common, and anything already in
 * the device list is flagged rather than hidden so the list matches what the user can actually see.
 */

import type { DiscoveredDevice, DiscoverySource } from "$lib/types";
import { readNeighbours } from "./net/arp";
import { ipv4ToInt, localAddresses, localSubnets, subnetContains, type LocalSubnet } from "./net/interfaces";
import { resolveMdnsHostnames } from "./net/mdns";
import { discoverSsdpDevices } from "./net/ssdp";
import { sweepSubnets } from "./net/sweep";
import { selectDevices } from "./devices";

export type NetworkScan = {
	devices: DiscoveredDevice[];
	/** The subnets that were swept, e.g. `["192.168.1.0/24"]`, so the UI can say what it looked at. */
	subnets: string[];
	scannedAt: Date;
};

const describeSubnet = (subnet: LocalSubnet) => {
	const broadcast = ipv4ToInt(subnet.broadcast);
	const network = broadcast - subnet.hostCount - 1;
	return `${[0x1000000, 0x10000, 0x100, 1].map((d) => Math.floor(network / d) % 0x100).join(".")}/${subnet.prefix}`;
};

/** Builds the entry for an address, creating it on first sight and merging into it afterwards. */
const entryFor = (devices: Map<string, DiscoveredDevice>, ip: string, source: DiscoverySource) => {
	const existing = devices.get(ip);
	if (existing) {
		if (!existing.sources.includes(source)) existing.sources.push(source);
		return existing;
	}

	const device: DiscoveredDevice = { ip, sources: [source] };
	devices.set(ip, device);
	return device;
};

/**
 * Scans every directly-connected subnet and returns what answered. Each source is best-effort - a
 * network that blocks multicast still yields a full ARP result, and a machine that can't read its
 * neighbour table still yields whatever announced itself - so a partial answer beats an error.
 */
export const scanNetwork = async (): Promise<NetworkScan> => {
	const subnets = localSubnets();

	// The sweep and the SSDP search don't depend on each other, and both are mostly spent waiting,
	// so running them together makes a scan as long as the slower one rather than their sum.
	const [, ssdpDevices] = await Promise.all([sweepSubnets(subnets), discoverSsdpDevices()]);

	const ownAddresses = localAddresses();
	const devices = new Map<string, DiscoveredDevice>();

	for (const neighbour of await readNeighbours()) {
		// A neighbour on an interface that isn't being swept (a VPN, say) isn't part of this network,
		// and the server itself is never a device it makes sense to offer to wake.
		if (ownAddresses.has(neighbour.ip)) continue;
		if (!subnets.some((subnet) => subnetContains(subnet, neighbour.ip))) continue;

		entryFor(devices, neighbour.ip, "arp").macAddress = neighbour.macAddress;
	}

	for (const [ip, ssdp] of ssdpDevices) {
		if (ownAddresses.has(ip)) continue;

		const device = entryFor(devices, ip, "ssdp");
		device.name = ssdp.name;
		device.server = ssdp.server;
	}

	// Asking only the addresses that actually answered keeps this to one small round of queries.
	for (const [ip, hostname] of await resolveMdnsHostnames([...devices.keys()])) {
		if (!devices.has(ip)) continue;
		entryFor(devices, ip, "mdns").hostname = hostname;
	}

	// A device counts as already known if either handle matches, since the same machine can be in the
	// list by MAC address from an earlier scan but under a different address after a DHCP lease moves.
	const known = await selectDevices();
	for (const device of devices.values()) {
		const match = known.find(
			(row) => (device.macAddress !== undefined && row.macAddress === device.macAddress) || row.ip === device.ip,
		);
		if (match) device.knownDeviceId = match.id;
	}

	return {
		devices: [...devices.values()].sort((a, b) => ipv4ToInt(a.ip) - ipv4ToInt(b.ip)),
		subnets: subnets.map(describeSubnet),
		scannedAt: new Date(),
	};
};
