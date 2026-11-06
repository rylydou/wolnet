import { macAddressBytes } from "#lib/mac.ts";

/** The standard Wake-on-LAN port. */
const WOL_PORT = 9;

/** Reaches every device on the local network. */
const BROADCAST_ADDRESS = "255.255.255.255";

/**
 * Builds a magic packet: 6 bytes of `0xff`, then the MAC address 16 times. Every Wake-on-LAN
 * network card recognizes it.
 */
export const buildMagicPacket = (macAddress: number) => {
	const mac = macAddressBytes(macAddress);
	const packet = new Uint8Array(6 + 16 * mac.length).fill(0xff, 0, 6);
	for (let i = 0; i < 16; i++) packet.set(mac, 6 + i * mac.length);
	return packet;
};

/**
 * Broadcasts a magic packet to wake the device with this MAC address. It's sent 3 times, because
 * UDP has no delivery receipts and broadcast packets get dropped. Devices ignore the extras.
 */
export const sendMagicPacket = async (macAddress: number) => {
	const packet = buildMagicPacket(macAddress);
	const socket = await Bun.udpSocket({});

	try {
		// Sending to a broadcast address fails unless this is turned on.
		socket.setBroadcast(true);
		for (let i = 0; i < 3; i++) socket.send(packet, WOL_PORT, BROADCAST_ADDRESS);
	} finally {
		socket.close();
	}
};
