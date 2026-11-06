import { error } from "@sveltejs/kit";
import * as devices from "#lib/server/devices.ts";
import { WAKE_TIMEOUT_MS } from "#lib/server/status.ts";
import { wake } from "#lib/server/wake.ts";
import { formatMacAddress, parseMacAddress } from "#lib/mac.ts";
import { deviceLabel } from "#lib/types.ts";
import type { RequestHandler } from "./$types";

/** Bun closes connections that stay quiet for 255 seconds (see `vite.config.ts`). */
const MAX_WAIT_SECONDS = 240;

/**
 * Wakes a device and waits until it's on. A GET, so it works with a plain `curl`.
 *
 * `{device}` is anything `devices.find` accepts, or any MAC address, even one not on the list.
 */
export const GET: RequestHandler = async ({ params, url, request, getClientAddress }) => {
	const wait = Number(url.searchParams.get("wait") ?? WAKE_TIMEOUT_MS / 1000);
	if (!Number.isFinite(wait) || wait < 0 || wait > MAX_WAIT_SECONDS) {
		error(400, `\`wait\` must be a number of seconds from 0 to ${MAX_WAIT_SECONDS}.`);
	}

	const row = await devices.find(params.device);
	const macAddress = row ? row.macAddress : (parseMacAddress(params.device) ?? null);
	if (!row && macAddress === null) error(404, `No device called "${params.device}", and it isn't a MAC address.`);

	const label = row ? deviceLabel(devices.toDevice(row)) : formatMacAddress(macAddress!);
	if (macAddress === null) error(400, `${label} has no MAC address, so it can't be woken.`);

	const result = await wake(
		{ id: row?.id, ip: row?.ip ?? null, macAddress, label },
		{
			from: `${getClientAddress().replace(/^::ffff:/, "")} (${request.headers.get("user-agent") ?? "API"})`,
			timeoutMs: wait > 0 ? wait * 1000 : undefined,
		},
	);

	// Read the device again at the end, so its status is current.
	const respond = async (status: number, body: { result: string; message: string }) => {
		const current = row && (await devices.find(row.id));
		return Response.json({ ...body, device: current ? devices.toDevice(current) : undefined }, { status });
	};

	if (result.alreadyOnline) return respond(200, { result: "alreadyOnline", message: `${label} is already on.` });
	if (wait === 0) return respond(202, { result: "sent", message: `Sent a wake signal to ${label}.` });

	if (!(await result.awake)) {
		error(504, `Sent a wake signal to ${label}, but it didn't come online within ${wait} seconds.`);
	}

	return respond(200, { result: "awake", message: `${label} is awake.` });
};
