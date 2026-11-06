import { scanNetwork } from "#lib/server/discovery.ts";
import type { RequestHandler } from "./$types";

/** Scans the local network for devices. Takes a few seconds. */
export const GET: RequestHandler = async () => Response.json(await scanNetwork());
