/** `waking` means a wake signal was sent and WolNet is waiting for the device to come online. */
export type DeviceStatus = "online" | "offline" | "waking";

/** A device on the list, as the web UI and the API see it. */
export type Device = {
	id: string;
	name?: string;
	hostname?: string;
	ip?: string;
	/** Like `00:1a:2b:3c:4d:5e`. */
	macAddress?: string;
	status: DeviceStatus;
	lastWokenAt?: Date;
	createdAt: Date;
	updatedAt: Date;
};

/** A device found by a network scan. It may or may not be on the list already. */
export type DiscoveredDevice = {
	ip: string;
	macAddress?: string;
	/** The name it answers to over mDNS, like `living-room-pi.local`. */
	hostname?: string;
	/** The name its owner gave it, from UPnP, like "Living Room TV". */
	name?: string;
	/** Which protocols found it. */
	sources: ("arp" | "mdns" | "ssdp")[];
	/** Set when the device is already on the list. */
	knownDeviceId?: string;
};

export type NetworkScan = {
	devices: DiscoveredDevice[];
	/** The subnets that were scanned, like `10.10.1.0/24`. */
	subnets: string[];
};

/** The best name to show for a device. */
export const deviceLabel = (device: Pick<Device, "id" | "name" | "hostname" | "ip" | "macAddress">) =>
	device.name ?? device.hostname ?? device.ip ?? device.macAddress ?? device.id;
