import * as devices from "./devices.ts";
import { isOnline } from "./net/presence.ts";
import { sendMagicPacket } from "./net/wol.ts";
import { markOnline, watchWake } from "./status.ts";

export type WakeTarget = {
	/** Set for devices on the list. */
	id?: string;
	ip: string | null;
	macAddress: number;
};

/**
 * Sends a wake signal, unless the device is already on. Afterwards `awake` resolves `true` once
 * the device comes online, or `false` if it doesn't within `timeoutMs`. Until then, the web UI
 * shows it as waking.
 */
export const wake = async (target: WakeTarget, timeoutMs?: number) => {
	if (await isOnline(target)) {
		if (target.id) markOnline(target.id);
		return { alreadyOnline: true } as const;
	}

	await sendMagicPacket(target.macAddress);
	if (target.id) await devices.markWoken(target.id);

	return {
		alreadyOnline: false,
		awake: watchWake(target.id ?? `mac:${target.macAddress}`, target, timeoutMs),
	} as const;
};
