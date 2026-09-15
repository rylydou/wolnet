import { json, type RequestHandler } from "@sveltejs/kit";
import { toDeviceResponse } from "$lib/server/api";
import { selectDeviceRows } from "$lib/server/devices";

/** Lists every device on the list, oldest first. */
export const GET: RequestHandler = async () => json({ devices: (await selectDeviceRows()).map(toDeviceResponse) });
