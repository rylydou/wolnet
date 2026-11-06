import { readJson, tryChange } from "#lib/server/api.ts";
import * as devices from "#lib/server/devices.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => Response.json({ devices: await devices.list() });

export const POST: RequestHandler = async ({ request }) => {
	const input = await readJson(request, devices.deviceInput);
	const row = await tryChange(() => devices.add(input));

	return Response.json(devices.toDevice(row), { status: 201 });
};
