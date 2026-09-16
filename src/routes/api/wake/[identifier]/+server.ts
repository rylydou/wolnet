import { error, json, type RequestHandler } from "@sveltejs/kit";
import { toDeviceResponse } from "$lib/server/api";
import { findDevice, isDeviceOnline, markDeviceOnline, markDeviceWoken, waitUntilOnline } from "$lib/server/devices";
import { sendMagicPacket } from "$lib/server/wol";
import { parseMacAddress } from "$lib/util";

/**
 * How long to keep polling a woken device before giving up, overridable with `?wait=<seconds>`.
 * A cold boot past POST and into a listening network stack is routinely a minute or more, so the
 * default is generous: the request answers when the device is up, not when the packet goes out.
 */
const DEFAULT_WAIT_SECONDS = 120;

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
 * Wakes a device known by hostname, id or MAC address and answers only once it is actually
 * answering on the network: one that is already up replies straight away without a packet being
 * sent, a woken one replies when it comes up, and one that never answers within the wait is a
 * `504` rather than a cheerful "packet sent". A MAC address is enough to confirm a wake on its own,
 * so a device with no IP address on record - or one that isn't on the list at all - is confirmed
 * like any other; only `?wait=0` leaves a wake unconfirmed, and answers `202`.
 */
const wake: RequestHandler = async ({ params, url }) => {
	const identifier = params.identifier!;
	const waitMs = readWaitMs(url);
	const device = await findDevice(identifier);

	if (!device) {
		const macAddress = parseMacAddress(identifier);
		if (macAddress === undefined) error(404, `No device known as "${identifier}", and it isn't a MAC address.`);

		// Nothing on the list matches, so there is no device to report alongside the result - but a MAC
		// address is all a presence check needs, so the wake itself can still be confirmed.
		const address = { ip: null, macAddress };
		if (await isDeviceOnline(address, { sweep: true })) {
			return json({ woken: false, alreadyOnline: true, confirmed: true });
		}

		await send(macAddress);
		if (waitMs === 0) return json({ woken: true, alreadyOnline: false, confirmed: false }, { status: 202 });

		if (!(await waitUntilOnline(address, { timeoutMs: waitMs }))) {
			error(504, `Woke ${identifier}, but it was still not answering after ${Math.round(waitMs / 1000)}s.`);
		}

		return json({ woken: true, alreadyOnline: false, confirmed: true });
	}

	// `markDeviceOnline` only writes when the status actually flips, so it answers `undefined` for a
	// device already recorded as online - in which case the row read up front is already current.
	let current = device;
	const respond = (body: Record<string, unknown>, status = 200) =>
		json({ ...body, device: toDeviceResponse(current) }, { status });

	// Sweeping is worth the few seconds it costs only for a device with no address to check directly.
	if (await isDeviceOnline(device, { sweep: device.ip === null })) {
		current = (await markDeviceOnline(device.id)) ?? current;
		return respond({ woken: false, alreadyOnline: true, confirmed: true });
	}

	if (device.macAddress == null) error(409, "This device has no MAC address set, so it can't be woken.");

	await send(device.macAddress);
	await markDeviceWoken(device.id);

	// With the wait waived, a sent packet is all there is to report.
	if (waitMs === 0) return respond({ woken: true, alreadyOnline: false, confirmed: false }, 202);

	if (!(await waitUntilOnline(device, { timeoutMs: waitMs }))) {
		error(504, `Woke ${identifier}, but it was still not answering after ${Math.round(waitMs / 1000)}s.`);
	}

	current = (await markDeviceOnline(device.id)) ?? current;
	return respond({ woken: true, alreadyOnline: false, confirmed: true });
};

export const GET = wake;
export const POST = wake;
