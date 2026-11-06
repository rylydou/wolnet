#!/usr/bin/env bun

/**
 * `wolnet`, the command line tool. It only talks to a WolNet server's API (see `docs/api.md`), so
 * it works the same against this machine or another one. It has no dependencies, so it can be
 * copied anywhere Bun is installed.
 */

import { parseArgs } from "node:util";

const USAGE = `wolnet - wake devices on your network

Usage:
  wolnet wake <device> [--wait <seconds>]   Wake a device and wait until it's on
  wolnet devices                            List devices (also: list, ls)
  wolnet add [fields]                       Add a device
  wolnet edit <device> [fields]             Change a device. Use "" to clear a field.
  wolnet remove <device>                    Remove a device (also: rm)
  wolnet scan                               Find devices on the network

<device> is a hostname, IP address, MAC address, or id. "wake" also takes
any MAC address, even one that isn't on the list.

Fields:
  --name <text>  --hostname <name>  --mac <address>  --ip <address>

Options:
  -s, --server <host[:port]>   The WolNet server to use. Defaults to $WOL_SERVER_URL,
                               or this machine. The port defaults to 8778.
  --wait <seconds>             How long "wake" waits for the device (default 120,
                               max 240). 0 means don't wait.`;

const DEFAULT_PORT = 8778;

/** `nas`, `nas:8080`, and `https://wol.example.com` all work. */
const toBaseUrl = (server: string) =>
	/^https?:\/\//.test(server) ? server : `http://${server.includes(":") ? server : `${server}:${DEFAULT_PORT}`}`;

let baseUrl = process.env.WOL_SERVER_URL ?? `http://localhost:${process.env.PORT ?? DEFAULT_PORT}`;

type Device = { id: string; name?: string; hostname?: string; ip?: string; macAddress?: string; status: string };

/** Calls the API and returns the JSON response, or throws its error message. */
const api = async (path: string, init: RequestInit = {}) => {
	let response: Response;
	try {
		// SvelteKit blocks changes (POST, PATCH, DELETE) that aren't JSON, so always say it's JSON.
		response = await fetch(new URL(path, baseUrl), { ...init, headers: { "content-type": "application/json" } });
	} catch (cause) {
		if ((cause as Error).name === "TimeoutError") throw new Error(`${baseUrl} didn't answer in time.`);
		throw new Error(`Couldn't reach WolNet at ${baseUrl}. Is it running?`);
	}

	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body.message ?? `The server answered ${response.status}.`);
	return body;
};

const label = (device: Device) => device.name ?? device.hostname ?? device.ip ?? device.macAddress ?? device.id;

/** Prints rows in lined-up columns. The first row is the header. */
const printTable = (rows: string[][]) => {
	const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
	for (const row of rows)
		console.log(
			row
				.map((cell, i) => cell.padEnd(widths[i]!))
				.join("   ")
				.trimEnd(),
		);
};

const FIELD_OPTIONS = {
	name: { type: "string" },
	hostname: { type: "string" },
	mac: { type: "string" },
	ip: { type: "string" },
} as const;

/** Reads `--name`, `--mac`, etc. into the API's field names. */
const readFields = (values: { name?: string; hostname?: string; mac?: string; ip?: string }) =>
	JSON.stringify({ name: values.name, hostname: values.hostname, macAddress: values.mac, ip: values.ip });

/** Reads the single `<device>` argument a command takes. */
const readDevice = (positionals: string[], usage: string) => {
	if (positionals.length !== 1) throw new Error(`Usage: ${usage}`);
	return encodeURIComponent(positionals[0]!);
};

const commands: Record<string, (args: string[]) => Promise<void>> = {
	async wake(args) {
		const { positionals, values } = parseArgs({ args, options: { wait: { type: "string" } }, allowPositionals: true });
		const device = readDevice(positionals, "wolnet wake <device> [--wait <seconds>]");
		const wait = Number(values.wait ?? 120);

		// Status goes to stderr, so piping the command only gets the result.
		if (wait > 0) console.error(`Waking ${positionals[0]}. Waiting up to ${wait} seconds for it to come online...`);

		const result = await api(`/api/wake/${device}?wait=${values.wait ?? 120}`, {
			signal: AbortSignal.timeout((wait + 15) * 1000),
		});
		console.log(result.message);
	},

	async devices(args) {
		parseArgs({ args });
		const { devices }: { devices: Device[] } = await api("/api/devices");
		if (devices.length === 0) return console.log("No devices yet. Add one with `wolnet add`.");

		printTable([
			["STATUS", "NAME", "HOSTNAME", "IP", "MAC ADDRESS"],
			...devices.map((device) => [
				device.status,
				device.name ?? "-",
				device.hostname ?? "-",
				device.ip ?? "-",
				device.macAddress ?? "-",
			]),
		]);
	},

	async add(args) {
		const { values } = parseArgs({ args, options: FIELD_OPTIONS });
		const device = await api("/api/devices", { method: "POST", body: readFields(values) });
		console.log(`Added ${label(device)}.`);
	},

	async edit(args) {
		const { positionals, values } = parseArgs({ args, options: FIELD_OPTIONS, allowPositionals: true });
		const device = readDevice(positionals, "wolnet edit <device> [--name] [--hostname] [--mac] [--ip]");
		const edited = await api(`/api/devices/${device}`, { method: "PATCH", body: readFields(values) });
		console.log(`Saved ${label(edited)}.`);
	},

	async remove(args) {
		const { positionals } = parseArgs({ args, allowPositionals: true });
		const device = readDevice(positionals, "wolnet remove <device>");
		const removed = await api(`/api/devices/${device}`, { method: "DELETE" });
		console.log(`Removed ${label(removed)}.`);
	},

	async scan(args) {
		parseArgs({ args });
		console.error("Scanning the network. This takes a few seconds...");

		const scan: { devices: (Device & { knownDeviceId?: string })[]; subnets: string[] } = await api("/api/scan");
		if (scan.devices.length === 0) return console.log("No devices answered.");

		printTable([
			["IP", "MAC ADDRESS", "NAME", "ON LIST"],
			...scan.devices.map((device) => [
				device.ip ?? "",
				device.macAddress ?? "-",
				device.name ?? device.hostname ?? "-",
				device.knownDeviceId ? "yes" : "",
			]),
		]);
		console.error(`\nAdd one with: wolnet add --ip <ip> --mac <mac address> --name <name>`);
	},

	async help() {
		console.log(USAGE);
	},
};

const ALIASES: Record<string, string> = {
	list: "devices",
	ls: "devices",
	rm: "remove",
	"--help": "help",
	"-h": "help",
};

/** Takes `--server` out of the arguments wherever it is, so it works with every command. */
const takeServer = (args: string[]) => {
	const rest: string[] = [];
	let server: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--server" || arg === "-s") server = args[++i] ?? "";
		else if (arg.startsWith("--server=")) server = arg.slice("--server=".length);
		else rest.push(arg);
	}

	if (server === "") throw new Error("`--server` needs a hostname, like `--server truenas`.");
	return { server, rest };
};

try {
	const { server, rest } = takeServer(process.argv.slice(2));
	if (server) baseUrl = toBaseUrl(server);

	const [name = "help", ...args] = rest;
	const command = commands[ALIASES[name] ?? name];
	if (!command) throw new Error(`Unknown command "${name}".\n\n${USAGE}`);

	await command(args);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
