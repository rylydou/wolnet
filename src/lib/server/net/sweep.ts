/**
 * Fills the kernel's ARP table with every device on the local network.
 *
 * To send anything to a local address, the kernel first has to learn its MAC address, so it asks
 * over ARP and saves the answer. Sending one tiny throwaway UDP packet to every address in the
 * subnet makes it do that for all of them. Nothing has to be listening, and no reply is read: the
 * answers end up in the ARP table, which `net/arp.ts` reads afterwards.
 *
 * The kernel only queues a few packets for addresses it hasn't resolved yet, so sends start failing
 * quickly on a big subnet. That's expected. A failed send just means nothing answered there.
 * Devices that are on answer within a millisecond or so, so the sweep runs for a fixed time budget
 * and then stops.
 */

import { hostAddresses, localSubnets } from "./interfaces.ts";

/** The discard port. Nothing needs to listen; only the ARP lookup matters. */
const PORT = 9;
const PAYLOAD = new Uint8Array(1);

/** Enough for a /24, the usual home network. Bigger subnets get a partial sweep. */
const BUDGET_MS = 3_000;

/** How long to wait for the last ARP answers to arrive. */
const SETTLE_MS = 750;

/** Longest wait for the send queue to drain, so a drain event that never comes can't stall it. */
const MAX_DRAIN_WAIT_MS = 20;

export const sweep = async (subnets = localSubnets()) => {
	if (subnets.length === 0) return;

	let drained: (() => void) | undefined;
	const socket = await Bun.udpSocket({
		socket: {
			drain: () => drained?.(),
			// "Port unreachable" replies end up here. They're expected, so ignore them.
			error: () => {},
		},
	});

	const deadline = Date.now() + BUDGET_MS;

	try {
		for (const subnet of subnets) {
			for (const address of hostAddresses(subnet)) {
				if (Date.now() >= deadline) return;

				try {
					// `false` means the send buffer is full, so wait for it to drain.
					if (!socket.send(PAYLOAD, PORT, address)) {
						await new Promise<void>((resolve) => {
							drained = resolve;
							setTimeout(resolve, MAX_DRAIN_WAIT_MS);
						});
					}
				} catch {
					// Nothing answered at this address. That's a normal result, so keep going.
				}
			}
		}
	} finally {
		socket.close();
		await Bun.sleep(SETTLE_MS);
	}
};
