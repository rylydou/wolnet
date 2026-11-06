/**
 * Asks "who has this IP address?" over ARP, using the `arping` command from iputils.
 *
 * This is the most reliable way to tell if a device on the local network is on. Every running
 * device answers ARP, even one that blocks ping and every port, because a network stack that
 * stops answering ARP stops working. It also says which MAC address answered, so a device whose IP
 * address was handed to something else isn't mistaken for being on.
 *
 * `arping` needs the `CAP_NET_RAW` capability. Linux distros ship it with that already, and the
 * Docker image sets it up.
 */

import { parseMacAddress } from "#lib/mac.ts";

/** Like `Unicast reply from 10.10.1.1 [6C:1F:F7:21:C3:91]  1.952ms`. */
const REPLY_PATTERN = /reply from [\d.]+ \[([0-9a-f:]{17})\]\s+([\d.]+)ms/i;

/** `arping` exit codes. */
const NO_REPLY = 1;

export class ArpingError extends Error {}

/**
 * Sends ARP requests to `ip` for up to `timeoutSeconds`. Returns the MAC address that answered and
 * how long it took, or `undefined` if nothing answered. Throws `ArpingError` if `arping` can't run.
 */
export const arping = async (ip: string, interfaceName: string, timeoutSeconds = 1) => {
	let process;
	try {
		process = Bun.spawn(["arping", "-f", "-w", String(timeoutSeconds), "-I", interfaceName, ip], {
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		throw new ArpingError(`Couldn't run \`arping\` (${(error as Error).message}). Is iputils' arping installed?`);
	}

	const [output, errors, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);

	const reply = REPLY_PATTERN.exec(output);
	if (reply) return { macAddress: parseMacAddress(reply[1]!)!, ms: Number(reply[2]) };
	if (exitCode === NO_REPLY) return undefined;

	throw new ArpingError(`\`arping\` failed: ${errors.trim() || `exit code ${exitCode}`}`);
};
