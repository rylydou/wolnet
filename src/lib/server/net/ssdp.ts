/**
 * SSDP (the discovery half of UPnP), used to put a friendly label on an address.
 *
 * An `M-SEARCH` is multicast to the SSDP group, but unlike mDNS every responder answers by unicast
 * back to the sender, so an ephemeral socket receives replies without contending for the well-known
 * port. A reply is an HTTP-shaped header block; the interesting part is `LOCATION`, a URL for a
 * device description document whose `<friendlyName>` is the name the device's owner actually gave
 * it - "Living Room TV" rather than `192.168.1.42`.
 */

const SSDP_GROUP = "239.255.255.250";
const SSDP_PORT = 1900;

/**
 * Responders stagger their replies randomly across `MX` seconds to avoid a stampede, so the listen
 * window has to outlast it.
 */
const SSDP_MX_SECONDS = 2;

/** Device description documents are small; a slow one isn't worth holding up a scan for. */
const DESCRIPTION_TIMEOUT_MS = 1_500;
const DESCRIPTION_CONCURRENCY = 8;

export type SsdpDevice = {
	ip: string;
	/** The device's own name for itself, from its description document. */
	name?: string;
	/** The `SERVER` header, e.g. `Linux/5.4 UPnP/1.0 MiniDLNA/1.3`. */
	server?: string;
};

const buildSearch = (searchTarget: string) =>
	new TextEncoder().encode(
		[
			"M-SEARCH * HTTP/1.1",
			`HOST: ${SSDP_GROUP}:${SSDP_PORT}`,
			'MAN: "ssdp:discover"',
			`MX: ${SSDP_MX_SECONDS}`,
			`ST: ${searchTarget}`,
			"",
			"",
		].join("\r\n"),
	);

/** Splits an SSDP reply's header block into a lowercase-keyed map. */
const parseHeaders = (message: string) => {
	const headers = new Map<string, string>();

	// The first line is the status line (`HTTP/1.1 200 OK`), which carries nothing we need.
	for (const line of message.split(/\r?\n/).slice(1)) {
		const separator = line.indexOf(":");
		if (separator === -1) continue;
		headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
	}

	return headers;
};

const FRIENDLY_NAME_PATTERN = /<friendlyName>([^<]+)<\/friendlyName>/i;

/**
 * Fetches a device description and pulls out its friendly name. The document is XML, but only one
 * element is wanted, so a pattern beats pulling in a parser - and a device that serves something
 * unexpected just yields no name rather than breaking the scan.
 */
const fetchFriendlyName = async (location: string) => {
	try {
		const response = await fetch(location, { signal: AbortSignal.timeout(DESCRIPTION_TIMEOUT_MS) });
		if (!response.ok) return undefined;

		return FRIENDLY_NAME_PATTERN.exec(await response.text())?.[1]?.trim() || undefined;
	} catch {
		return undefined;
	}
};

/** Runs `task` over the items a few at a time, so a scan doesn't open one socket per device at once. */
const mapWithConcurrency = async <Item, Result>(
	items: Item[],
	limit: number,
	task: (item: Item) => Promise<Result>,
) => {
	const results: Result[] = [];
	for (let i = 0; i < items.length; i += limit) {
		results.push(...(await Promise.all(items.slice(i, i + limit).map(task))));
	}
	return results;
};

/**
 * Multicasts an `M-SEARCH`, collects the replies, then resolves each responder's friendly name.
 * Returns what was found keyed by IP address.
 */
export const discoverSsdpDevices = async ({ timeoutMs = 3_000 } = {}) => {
	// A responder answers once per service it advertises, so keep only the first reply per address.
	const replies = new Map<string, { location?: string; server?: string }>();

	const socket = await Bun.udpSocket({
		socket: {
			data: (_socket, message, _port, address) => {
				if (replies.has(address)) return;

				const headers = parseHeaders(message.toString());
				replies.set(address, { location: headers.get("location"), server: headers.get("server") });
			},
			error: () => {},
		},
	});

	try {
		socket.setMulticastTTL(4);
		socket.setMulticastLoopback(false);

		// UDP gives no delivery guarantee and multicast is dropped freely, so ask more than once.
		// `ssdp:all` invites every responder; `upnp:rootdevice` is answered by some that ignore it.
		for (const searchTarget of ["ssdp:all", "upnp:rootdevice"]) {
			socket.send(buildSearch(searchTarget), SSDP_PORT, SSDP_GROUP);
		}

		await Bun.sleep(timeoutMs);
	} finally {
		socket.close();
	}

	const devices = await mapWithConcurrency(
		[...replies.entries()],
		DESCRIPTION_CONCURRENCY,
		async ([ip, { location, server }]): Promise<SsdpDevice> => ({
			ip,
			server,
			name: location ? await fetchFriendlyName(location) : undefined,
		}),
	);

	return new Map(devices.map((device) => [device.ip, device]));
};
