/**
 * Provokes the kernel into populating its ARP table, either for a list of addresses or for a whole
 * subnet.
 *
 * The trick is that ARP resolution happens *below* UDP: to send even one datagram to a
 * directly-connected address, the kernel must first learn that address's MAC, so it broadcasts an
 * ARP request and caches whatever answers. Nothing needs to be listening on the far end and no
 * reply is ever read - the datagram itself is throwaway. That makes a sweep one cheap `send` per
 * host rather than a TCP connection per host per port, and it finds devices that drop every probe
 * a port scan would use, because answering ARP is not optional on a working IPv4 stack.
 *
 * Touching an address the kernel already has an entry for matters just as much: a cached entry goes
 * `STALE` once it has been quiet for a while, and sending to it is what makes the kernel revalidate
 * it - confirming a device that is still there, and dropping the entry for one that has left.
 *
 * The kernel, not the network, sets the pace. It queues packets bound for addresses it hasn't
 * resolved yet and that queue is small, so sends start failing almost immediately on a large
 * subnet - with `EAGAIN` while the queue drains, or `EHOSTUNREACH` once it gives up on an address
 * that never answered. Both are ordinary results here rather than errors: an address that fails to
 * resolve is precisely an address with nothing behind it. Live devices answer ARP in about a
 * millisecond, so they land early; the time is spent on absent addresses, which is why a sweep
 * runs to a budget and simply stops when it expires.
 */

import { hostAddresses, type LocalSubnet } from "./interfaces";

/** The discard service. Nothing is expected to listen; only the ARP lookup it forces matters. */
const SWEEP_PORT = 9;

const SWEEP_PAYLOAD = new Uint8Array(1);

/**
 * How long to spend provoking ARP. Sized so a /24 - by far the most common home subnet - is covered
 * comfortably, while a much larger one degrades into a partial sweep instead of a long stall. The
 * caller overlaps this with the other discovery protocols, so it is not time added to a scan.
 */
export const SWEEP_BUDGET_MS = 3_000;

/**
 * How long to let the last ARP replies arrive before reading the table. Resolution is a single
 * round trip on the local segment, so this mostly covers devices that answer lazily.
 */
export const ARP_SETTLE_MS = 750;

/** Longest pause while the kernel's queue drains, so a drain event that never comes can't stall us. */
const MAX_DRAIN_WAIT_MS = 20;

/**
 * Sends a throwaway datagram to every given address so the kernel resolves (or revalidates) each
 * one's MAC address, then waits for the replies to land. Callers read the results afterwards with
 * `readNeighbours`.
 */
export const touchAddresses = async (
	addresses: Iterable<string>,
	{ settleMs = ARP_SETTLE_MS, budgetMs = SWEEP_BUDGET_MS } = {},
) => {
	let drained: (() => void) | undefined;
	let sent = 0;

	const socket = await Bun.udpSocket({
		socket: {
			drain: () => drained?.(),
			// An ICMP "port unreachable" coming back surfaces here; an unhandled one would tear the
			// sweep down, and it tells us nothing the ARP table won't.
			error: () => {},
		},
	});

	/** Waits for the send queue to drain, giving up quickly so a quiet socket can't block the sweep. */
	const waitForDrain = () =>
		new Promise<void>((resolve) => {
			drained = resolve;
			setTimeout(resolve, MAX_DRAIN_WAIT_MS);
		});

	const deadline = Date.now() + budgetMs;

	try {
		for (const address of addresses) {
			if (Date.now() >= deadline) return;

			try {
				sent++;
				// `false` means the send buffer is full rather than that the address is bad.
				if (!socket.send(SWEEP_PAYLOAD, SWEEP_PORT, address)) await waitForDrain();
			} catch {
				// `EHOSTUNREACH` and friends mean nothing answered at that address, which is a
				// perfectly good outcome for a scan - keep going.
			}
		}
	} finally {
		socket.close();
		// Nothing was sent, so there is nothing to wait for.
		if (sent > 0) await Bun.sleep(settleMs);
	}
};

/**
 * Touches every host address on the given subnets so the ARP table fills in, then waits for the
 * replies to land. Callers read the table afterwards with `readNeighbours`.
 */
export const sweepSubnets = async (subnets: LocalSubnet[], options?: { settleMs?: number; budgetMs?: number }) => {
	if (subnets.length === 0) return;

	await touchAddresses(
		(function* () {
			for (const subnet of subnets) yield* hostAddresses(subnet);
		})(),
		options,
	);
};
