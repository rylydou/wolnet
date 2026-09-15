/**
 * Thin, reusable wrapper around Bun's UDP socket for fire-and-forget datagrams (broadcasts,
 * beacons, discovery pings, and the like). Kept separate from any single feature so it can be
 * reused wherever something needs to shove bytes onto the LAN without a connection.
 */

export type UdpDatagram = {
	/** Destination address, e.g. a host, a subnet broadcast address, or `255.255.255.255`. */
	address: string;
	port: number;
	data: Uint8Array;
};

/**
 * Sends one or more UDP datagrams from a single ephemeral socket, then closes it. Datagrams are
 * fire-and-forget by nature (UDP gives no delivery confirmation), so callers that need reliability
 * should send the same payload more than once rather than expect an acknowledgement.
 */
export const sendUdpDatagrams = async (datagrams: UdpDatagram[]) => {
	if (datagrams.length === 0) return;

	// `broadcast` isn't a constructor option - SO_BROADCAST has to be set on the socket after it's
	// created, or sending to a broadcast address fails with EACCES.
	const socket = await Bun.udpSocket({});
	socket.setBroadcast(true);
	try {
		for (const { address, port, data } of datagrams) {
			socket.send(data, port, address);
		}
	} finally {
		socket.close();
	}
};
