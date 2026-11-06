import { error } from "@sveltejs/kit";
import { findDevice, readJson, tryChange } from "#lib/server/api.ts";
import * as devices from "#lib/server/devices.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) =>
	Response.json(devices.toDevice(await findDevice(params.device)));

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = await findDevice(params.device);
	const input = await readJson(request, devices.deviceInput);

	const row = (await tryChange(() => devices.edit(id, input))) ?? error(404, "That device was just removed.");
	return Response.json(devices.toDevice(row));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = await findDevice(params.device);

	const row = (await devices.remove(id)) ?? error(404, "That device was just removed.");
	return Response.json(devices.toDevice(row));
};
