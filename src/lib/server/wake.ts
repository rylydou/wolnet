import * as devices from "./devices.ts";
import { log } from "./log.ts";
import { sendMagicPacket } from "./net/wol.ts";
import { statusOf, watchWake } from "./status.ts";

export type WakeTarget = {
	/** Set for devices on the list. */
	id?: string;
	ip: string | null;
	macAddress: number;
	/** What to call it in the logs. */
	label: string;
};

/**
 * Sends a wake signal. If the device already shows as on, says so. Otherwise `awake` resolves
 * `true` once the device comes online, or `false` if it doesn't within `timeoutMs`. Until then,
 * the web UI shows it as waking. `from` says who asked, for the logs.
 */
export const wake = async (target: WakeTarget, { from, timeoutMs }: { from: string; timeoutMs?: number }) => {
	const key = target.id ?? `mac:${target.macAddress}`;
	const alreadyOnline = statusOf(key) === "online";

	// Always send it, even to a device that shows as on. It does nothing to a device that's awake,
	// and some sleeping devices still answer the network now and then, so "on" can be wrong.
	await sendMagicPacket(target.macAddress);
	if (target.id) await devices.markWoken(target.id);
	log(`Sent a wake signal to ${target.label}, from ${from}. It showed as ${alreadyOnline ? "on" : "off"}.`);

	if (alreadyOnline) return { alreadyOnline } as const;
	return { alreadyOnline, awake: watchWake(key, target, target.label, timeoutMs) } as const;
};
