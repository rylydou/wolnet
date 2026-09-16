#!/usr/bin/env bun

/**
 * `wolnet`, the command line front end for the server. It is deliberately a thin HTTP client
 * rather than a second copy of the logic: every command maps onto an endpoint, so the CLI behaves
 * identically against a remote instance and against one running on this machine, and validation
 * only ever lives in one place.
 */

import { parseArgs } from "node:util";

const USAGE = `wolnet - wake devices on your network

Usage:
  wolnet wake <hostname|mac> [--wait <seconds>]   Wake a known device, or any MAC address, and
                                                  wait until it answers (default 120s)
  wolnet add [--hostname <name>] [--mac <address>] [--ip <address>] [--comment <text>] [--replace]
                                                  Add a device, or update a matching one
  wolnet remove <hostname|mac>                    Remove a device            (aliases: rm)
  wolnet devices                                  List known devices  (aliases: list, ls)

Options:
  -s, --server <hostname[:port]>   Run the command against another WolNet instance, rather than
                                   the one named by WOL_SERVER_URL or the one on this machine.
      --replace                    Make \`add\` describe the device in full: fields left out are
                                   cleared, instead of being left as they are.`;

const DEFAULT_PORT = 3333;

/** `nas.local`, `nas.local:8080` and `https://wol.example.com` all name an instance to talk to. */
const toBaseUrl = (server: string) =>
	/^https?:\/\//.test(server) ? server : `http://${server.includes(":") ? server : `${server}:${DEFAULT_PORT}`}`;

/** Where requests go, unless `--server` names somewhere else. */
let baseUrl = process.env.WOL_SERVER_URL ?? `http://localhost:${process.env.PORT ?? DEFAULT_PORT}`;

/** Calls the server and unwraps its JSON, turning a failure into a message worth printing. */
const request = async (path: string, init?: RequestInit) => {
	let response: Response;
	try {
		response = await fetch(new URL(path, baseUrl), init);
	} catch (cause) {
		// A `wake` waits for the device to boot, so a timeout here is the server still working, not a
		// server that isn't there - saying "is it running?" would send someone looking the wrong way.
		if ((cause as Error)?.name === "TimeoutError") throw new Error(`${baseUrl} didn't answer in time.`);
		throw new Error(`Could not reach a server at ${baseUrl}. Is it running?`);
	}

	const body = (await response.json().catch(() => ({}))) as Record<string, any>;
	if (!response.ok) throw new Error(body.message ?? `The server answered ${response.status}.`);

	return body;
};

/** Names a device the way its owner would: by whichever handle they gave it. */
const describe = (device: Record<string, any>) => device.hostname ?? device.macAddress ?? device.ip ?? device.id;

/** Prints rows in aligned columns, the first row being the header. */
const printTable = (rows: string[][]) => {
	const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
	for (const row of rows) {
		console.log(
			row
				.map((cell, column) => cell.padEnd(widths[column]!))
				.join("   ")
				.trimEnd(),
		);
	}
};

/** Reads the one identifier a command takes, rejecting a missing or ambiguous one. */
const readIdentifier = (args: string[], usage: string) => {
	const { positionals } = parseArgs({ args, allowPositionals: true });
	if (positionals.length !== 1) throw new Error(`Usage: ${usage}`);

	return positionals[0]!;
};

/** Mirrors the server's own default, so the client stops waiting a little after the server does. */
const DEFAULT_WAIT_SECONDS = 120;

/** Grace on top of the wait, covering the first reachability probe and the round trip. */
const WAIT_SLACK_MS = 15_000;

const wake = async (args: string[]) => {
	const { positionals, values } = parseArgs({ args, options: { wait: { type: "string" } }, allowPositionals: true });
	if (positionals.length !== 1) throw new Error("Usage: wolnet wake <hostname|mac> [--wait <seconds>]");

	const identifier = positionals[0]!;
	const waitSeconds = values.wait === undefined ? DEFAULT_WAIT_SECONDS : Number(values.wait);
	if (!Number.isFinite(waitSeconds) || waitSeconds < 0) throw new Error("`--wait` must be a number of seconds.");

	// The server holds the request open until the device answers, so this can legitimately take
	// minutes. Say so up front - on stderr, so piping the command still yields only its result.
	console.error(`Waking ${identifier}, waiting up to ${waitSeconds}s for it to come online...`);

	const result = await request(`/api/wake/${encodeURIComponent(identifier)}?wait=${waitSeconds}`, {
		method: "POST",
		signal: AbortSignal.timeout(waitSeconds * 1000 + WAIT_SLACK_MS),
	});

	if (result.alreadyOnline) console.log(`${identifier} is already online.`);
	else if (result.confirmed) console.log(`${identifier} is awake.`);
	else if (result.device?.ip) console.log(`Sent a wake packet to ${identifier}.`);
	// Without an IP there is nothing to probe, so a sent packet is as much as can ever be reported.
	else console.log(`Sent a wake packet to ${identifier}. It has no IP address, so it can't be confirmed.`);
};

const add = async (args: string[]) => {
	const { values } = parseArgs({
		args,
		options: {
			hostname: { type: "string" },
			mac: { type: "string" },
			ip: { type: "string" },
			comment: { type: "string" },
			replace: { type: "boolean" },
		},
	});

	const { mac, replace, ...rest } = values;
	const device = await request("/api/add-device", {
		// The two verbs are the API's replace-or-merge switch; a bare `add` keeps what it isn't told.
		method: replace ? "POST" : "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ ...rest, macAddress: mac }),
	});

	console.log(`Saved ${describe(device)}.`);
};

const remove = async (args: string[]) => {
	const identifier = readIdentifier(args, "wolnet remove <hostname|mac>");
	const { removed } = await request(`/api/remove-device/${encodeURIComponent(identifier)}`, { method: "DELETE" });

	console.log(`Removed ${describe(removed)}.`);
};

const devices = async (args: string[]) => {
	parseArgs({ args });

	const { devices: known } = await request("/api/devices");
	if (known.length === 0) return console.log("No devices yet. Add one with `wolnet add`.");

	printTable([
		["STATUS", "HOSTNAME", "IP", "MAC ADDRESS", "COMMENT"],
		...known.map((device: Record<string, any>) => [
			device.status,
			device.hostname ?? "-",
			device.ip ?? "-",
			device.macAddress ?? "-",
			device.comment ?? "",
		]),
	]);
};

const help = async () => console.log(USAGE);

const commands: Record<string, (args: string[]) => Promise<unknown>> = {
	wake,
	add,
	remove,
	rm: remove,
	devices,
	list: devices,
	ls: devices,
	help,
	"--help": help,
	"-h": help,
};

/**
 * Pulls the global `--server` out of the arguments wherever it appears, so every command can be
 * pointed at another instance without each one having to know about the flag.
 */
const takeServerFlag = (args: string[]) => {
	let server: string | undefined;
	const rest: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		const separate = arg === "--server" || arg === "-s";
		if (!separate && !arg.startsWith("--server=")) {
			rest.push(arg);
			continue;
		}

		server = separate ? args[++i] : arg.slice("--server=".length);
		if (!server) throw new Error("`--server` needs a hostname, such as `--server nas.local`.");
	}

	return { server, rest };
};

try {
	const { server, rest } = takeServerFlag(process.argv.slice(2));
	if (server !== undefined) baseUrl = toBaseUrl(server);

	const [name = "help", ...args] = rest;
	const command = commands[name];
	if (!command) throw new Error(`Unknown command "${name}".\n\n${USAGE}`);

	await command(args);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
