/**
 * Finds devices on the local network. It combines three sources, since none gives the whole picture:
 *
 * - **ARP**: A sweep finds every device with a working network stack, even ones that block every
 *   port. It's also the only source of MAC addresses, which Wake-on-LAN needs.
 * - **mDNS**: The name a device calls itself, like `living-room-pi.local`.
 * - **UPnP (SSDP)**: The name a person gave it, like "Living Room TV".
 *
 * Each source is best-effort. A network that blocks multicast still gets a full ARP result.
 */

import { formatMacAddress } from "#lib/mac.ts";
import type { DiscoveredDevice, NetworkScan } from "#lib/types.ts";
import * as devices from "./devices.ts";
import { readNeighbours } from "./net/arp.ts";
import { ipv4ToInt, localAddresses, localSubnets, subnetOf } from "./net/interfaces.ts";
import { resolveMdnsHostnames } from "./net/mdns.ts";
import { discoverSsdpDevices } from "./net/ssdp.ts";
import { sweep } from "./net/sweep.ts";

export const scanNetwork = async (): Promise<NetworkScan> => {
	const subnets = localSubnets();
	const ownAddresses = localAddresses();

	// Both of these are mostly waiting, so run them at the same time.
	const [, ssdpDevices] = await Promise.all([sweep(subnets), discoverSsdpDevices()]);

	const found = new Map<string, DiscoveredDevice>();
	const entry = (ip: string, source: DiscoveredDevice["sources"][number]) => {
		const device = found.get(ip) ?? { ip, sources: [] };
		if (!device.sources.includes(source)) device.sources.push(source);
		found.set(ip, device);
		return device;
	};

	for (const neighbour of readNeighbours()) {
		if (ownAddresses.has(neighbour.ip) || !subnetOf(neighbour.ip, subnets)) continue;
		entry(neighbour.ip, "arp").macAddress = formatMacAddress(neighbour.macAddress);
	}

	for (const ssdp of ssdpDevices) {
		if (ownAddresses.has(ssdp.ip)) continue;
		entry(ssdp.ip, "ssdp").name = ssdp.name;
	}

	for (const [ip, hostname] of await resolveMdnsHostnames([...found.keys()])) {
		entry(ip, "mdns").hostname = hostname;
	}

	// Match by MAC or IP, since a device on the list may have moved to a new IP address.
	const known = await devices.list();
	for (const device of found.values()) {
		device.knownDeviceId = known.find(
			(row) => (device.macAddress && row.macAddress === device.macAddress) || row.ip === device.ip,
		)?.id;
	}

	return {
		devices: [...found.values()].sort((a, b) => ipv4ToInt(a.ip) - ipv4ToInt(b.ip)),
		subnets: subnets.map((subnet) => subnet.cidr),
	};
};
