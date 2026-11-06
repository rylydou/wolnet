/**
 * Checks if anything answers at an address by trying to open TCP connections. Used for devices on
 * other networks, where ARP can't reach. (Ping would need raw sockets, which Bun doesn't have.)
 *
 * An accepted, refused, or reset connection all mean a device is there. Only silence means it isn't,
 * so a device that silently drops every port looks off.
 */

/** Ports that something is usually listening on: web, SSH, Windows file sharing, remote desktop. */
const PORTS = [80, 443, 22, 445, 3389];

const TIMEOUT_MS = 1_500;

const ANSWERED = new Set(["ECONNREFUSED", "ECONNRESET"]);

const tryPort = (host: string, port: number) =>
	new Promise<boolean>((resolve, reject) => {
		const answered = (error: unknown) => ANSWERED.has((error as NodeJS.ErrnoException).code ?? "");
		const settle = (reachable: boolean) => (reachable ? resolve(true) : reject());

		setTimeout(() => settle(false), TIMEOUT_MS);
		Bun.connect({
			hostname: host,
			port,
			socket: {
				open: (socket) => {
					socket.end();
					settle(true);
				},
				error: (_socket, error) => settle(answered(error)),
				close: () => settle(false),
				data: () => {},
			},
		}).catch((error) => settle(answered(error)));
	});

/** `true` as soon as any port answers, or `false` once they've all failed or timed out. */
export const isHostReachable = (host: string) =>
	Promise.any(PORTS.map((port) => tryPort(host, port))).catch(() => false);
