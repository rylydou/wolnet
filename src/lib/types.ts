export type Device = {
	id: string;
	comment?: string;
	hostname?: string;
	ip?: string;
	macAddress?: number;
	status: "online" | "offline";
	statusChangedAt?: Date;
	lastWokenAt?: Date;
	createdAt: Date;
	updatedAt: Date;
};

/** The subset of a device that can be typed into the add and edit forms. */
export type DeviceDefaults = Pick<Device, "comment" | "hostname" | "ip" | "macAddress">;

/** Which protocol turned up a discovered device; a device is often seen by more than one. */
export type DiscoverySource = "arp" | "mdns" | "ssdp";

/**
 * A device found on the network, which may or may not already be in the device list. Only the IP
 * address is guaranteed - every other field depends on which sources answered for it.
 */
export type DiscoveredDevice = {
	ip: string;
	macAddress?: number;
	/** The name the device answers to over mDNS, e.g. `living-room-pi.local`. */
	hostname?: string;
	/** The name the device's owner gave it, taken from its UPnP description. */
	name?: string;
	/** The device's UPnP `SERVER` header, a rough hint at what it is. */
	server?: string;
	sources: DiscoverySource[];
	/** Set when the device is already in the device list, so it can be shown as already added. */
	knownDeviceId?: string;
};
