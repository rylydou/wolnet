import { error, json, type RequestHandler } from "@sveltejs/kit";
import { toDeviceResponse } from "$lib/server/api";
import { findDevice, markDeviceWoken, waitUntilReachable } from "$lib/server/devices";
import { sendMagicPacket } from "$lib/server/wol";
import { isHostReachable } from "$lib/server/net/probe";
import { parseMacAddress } from "$lib/util";

/** How long to wait for a device to come up before answering, overridable with `?wait=<seconds>`. */
const DEFAULT_WAIT_SECONDS = 30;

const readWaitMs = (url: URL) => {
	const wait = url.searchParams.get("wait");
	if (wait === null) return DEFAULT_WAIT_SECONDS * 1000;

	const seconds = Number(wait);
	if (!Number.isFinite(seconds) || seconds < 0) error(400, "`wait` must be a number of seconds.");

	return seconds * 1000;
};

const send = async (macAddress: number) => {
	try {
		await sendMagicPacket(macAddress);
	} catch (cause) {
		console.error("Failed to send Wake-on-LAN packet:", cause);
		error(502, "Could not send the wake packet.");
	}
};

/**
 * Wakes a device known by hostname, id or MAC address. A MAC that isn't on the list is still woken
 * - the magic packet needs nothing but the address - it just can't be confirmed afterwards, since
 * there's no IP to probe.
 */
const wake: RequestHandler = async ({ params, url }) => {
	const identifier = params.identifier!;
	const device = await findDevice(identifier);

	if (!device) {
		const macAddress = parseMacAddress(identifier);
		if (macAddress === undefined) error(404, `No device known as "${identifier}", and it isn't a MAC address.`);

		await send(macAddress);
		// Nothing on the list matches, so there's no address to confirm the wake against.
		return json({ woken: true, alreadyOnline: false, confirmed: false });
	}

	if (device.ip && (await isHostReachable(device.ip))) {
		return json({ woken: false, alreadyOnline: true, confirmed: true, device: toDeviceResponse(device) });
	}

	if (device.macAddress == null) error(409, "This device has no MAC address set, so it can't be woken.");

	await send(device.macAddress);
	await markDeviceWoken(device.id);

	const waitMs = readWaitMs(url);
	const confirmed = device.ip && waitMs > 0 ? await waitUntilReachable(device.ip, { timeoutMs: waitMs }) : false;

	return json({ woken: true, alreadyOnline: false, confirmed, device: toDeviceResponse(device) });
};

export const GET = wake;
export const POST = wake;
