import { sendUdpDatagrams } from "./net/udp";

/** Standard Wake-on-LAN port. Some devices also listen on 7, so callers may add it if needed. */
export const WOL_PORT = 9;

/** No subnet-specific broadcast address is known, so fall back to hitting the whole LAN. */
export const GLOBAL_BROADCAST_ADDRESS = "255.255.255.255";

const MAC_ADDRESS_BYTES = 6;

/** Unpacks the 48-bit integer MAC into its 6 raw bytes, most significant byte first. */
const macToBytes = (macAddress: number) => {
	const bytes = new Uint8Array(MAC_ADDRESS_BYTES);
	for (let i = MAC_ADDRESS_BYTES - 1; i >= 0; i--) {
		bytes[MAC_ADDRESS_BYTES - 1 - i] = Math.floor(macAddress / 0x100 ** i) % 0x100;
	}
	return bytes;
};

/**
 * Builds a magic packet: 6 bytes of `0xff` followed by the target MAC address repeated 16 times.
 * This is the payload every Wake-on-LAN listener recognizes, independent of transport.
 */
export const buildMagicPacket = (macAddress: number) => {
	const mac = macToBytes(macAddress);
	const packet = new Uint8Array(6 + 16 * MAC_ADDRESS_BYTES);
	packet.fill(0xff, 0, 6);
	for (let i = 0; i < 16; i++) packet.set(mac, 6 + i * MAC_ADDRESS_BYTES);
	return packet;
};

/**
 * Sends a Wake-on-LAN magic packet for the given MAC address. UDP delivers no confirmation and
 * broadcast packets are routinely dropped, so the packet is sent a few times in a row - listeners
 * ignore the duplicates, but a lost single packet no longer means a missed wake.
 */
export const sendMagicPacket = async (
	macAddress: number,
	{
		address = GLOBAL_BROADCAST_ADDRESS,
		port = WOL_PORT,
		repeat = 3,
	}: { address?: string; port?: number; repeat?: number } = {},
) => {
	const data = buildMagicPacket(macAddress);
	await sendUdpDatagrams(Array.from({ length: repeat }, () => ({ address, port, data })));
};
