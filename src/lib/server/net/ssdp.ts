/**
 * SSDP, the discovery part of UPnP. Used to find the name a person gave a device, like "Living
 * Room TV".
 *
 * WolNet multicasts a search, and every UPnP device answers it directly. Each answer has a
 * `LOCATION` header: a URL to an XML file describing the device, whose `<friendlyName>` is its name.
 */

const SSDP_GROUP = "239.255.255.250";
const SSDP_PORT = 1900;

/** Devices wait a random time up to this long before answering, so the listen time has to be longer. */
const MX_SECONDS = 2;
const LISTEN_MS = 3_000;

const DESCRIPTION_TIMEOUT_MS = 1_500;

export type SsdpDevice = { ip: string; name?: string };

const buildSearch = (searchTarget: string) =>
	new TextEncoder().encode(
		[
			"M-SEARCH * HTTP/1.1",
			`HOST: ${SSDP_GROUP}:${SSDP_PORT}`,
			'MAN: "ssdp:discover"',
			`MX: ${MX_SECONDS}`,
			`ST: ${searchTarget}`,
			"",
			"",
		].join("\r\n"),
	);

/** The `LOCATION` header of an answer. */
const readLocation = (message: string) => /^location:\s*(\S+)/im.exec(message)?.[1];

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Fetches a device's description and pulls out its name. A regex is enough for one element. */
const fetchFriendlyName = async (location: string) => {
	try {
		const response = await fetch(location, { signal: AbortSignal.timeout(DESCRIPTION_TIMEOUT_MS) });
		if (!response.ok) return undefined;

		const name = /<friendlyName>([^<]+)<\/friendlyName>/i.exec(await response.text())?.[1];
		return name?.replace(/&(\w+);/g, (entity, key) => XML_ENTITIES[key] ?? entity).trim() || undefined;
	} catch {
		return undefined;
	}
};

/** Searches for UPnP devices and looks up each one's name. */
export const discoverSsdpDevices = async (): Promise<SsdpDevice[]> => {
	// Devices answer once for each service they have, so keep the first answer from each address.
	const locations = new Map<string, string | undefined>();

	const socket = await Bun.udpSocket({
		socket: {
			data: (_socket, message, _port, address) => {
				if (!locations.has(address)) locations.set(address, readLocation(message.toString()));
			},
			error: () => {},
		},
	});

	try {
		socket.setMulticastTTL(4);
		socket.setMulticastLoopback(false);

		// Multicast packets get dropped, so search twice. Some devices only answer `upnp:rootdevice`.
		for (const searchTarget of ["ssdp:all", "upnp:rootdevice"]) {
			socket.send(buildSearch(searchTarget), SSDP_PORT, SSDP_GROUP);
		}

		await Bun.sleep(LISTEN_MS);
	} finally {
		socket.close();
	}

	return Promise.all(
		[...locations].map(async ([ip, location]) => ({
			ip,
			name: location ? await fetchFriendlyName(location) : undefined,
		})),
	);
};
