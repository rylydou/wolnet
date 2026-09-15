/**
 * Generic "is anything answering on this host" check, built on a raw TCP connect rather than ICMP
 * (unprivileged ping needs a raw socket the runtime doesn't expose). A device counts as reachable
 * the moment any candidate port accepts a connection, refuses one, or resets it - all of those mean
 * something is alive at that address, whereas a timeout means nothing answered.
 */

/** Common ports to try when the caller doesn't know what's listening on a device. */
export const DEFAULT_PROBE_PORTS = [80, 443, 22, 445, 3389, 9] as const;

const REFUSAL_CODES = new Set(["ECONNREFUSED", "ECONNRESET"]);

const probePort = (host: string, port: number, timeoutMs: number) =>
	new Promise<boolean>((resolve) => {
		let settled = false;
		const finish = (reachable: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(reachable);
		};

		const timer = setTimeout(() => finish(false), timeoutMs);

		Bun.connect({
			hostname: host,
			port,
			socket: {
				open: (socket) => {
					socket.end();
					finish(true);
				},
				error: (_socket, error) => finish(REFUSAL_CODES.has((error as NodeJS.ErrnoException).code ?? "")),
				close: () => finish(false),
				data: () => {},
			},
		}).catch((error: NodeJS.ErrnoException) => finish(REFUSAL_CODES.has(error.code ?? "")));
	});

/** Resolves `true` as soon as any candidate port responds, or `false` if every one times out. */
export const isHostReachable = async (
	host: string,
	{ ports = DEFAULT_PROBE_PORTS, timeoutMs = 1500 }: { ports?: readonly number[]; timeoutMs?: number } = {},
) => {
	const results = await Promise.all(ports.map((port) => probePort(host, port, timeoutMs)));
	return results.some(Boolean);
};
