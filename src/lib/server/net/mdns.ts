/**
 * Minimal multicast DNS client, used to put a human-readable name on an address a sweep found.
 *
 * mDNS is plain DNS sent to a multicast group, so the wire format here is the ordinary one. Two
 * details are specific to it. Responders normally answer to the group rather than to the sender,
 * which would need a socket bound to port 5353 - and on a typical Linux box Avahi already holds
 * that port, with no `SO_REUSEPORT` option exposed to reclaim it. Setting the "unicast response"
 * (QU) bit in the question's class asks responders to reply straight back to our ephemeral port
 * instead, which sidesteps the conflict entirely. The other is the TTL: RFC 6762 requires 255.
 */

const MDNS_GROUP = "224.0.0.251";
const MDNS_PORT = 5353;

/** RFC 6762 mandates a TTL of 255 for multicast DNS so replies aren't dropped as spoofed. */
const MDNS_TTL = 255;

const TYPE_A = 1;
const TYPE_PTR = 12;

const CLASS_IN = 1;
/** The QU bit, set in a question's class to request a unicast reply. */
const QUESTION_UNICAST_RESPONSE = 0x8000;

/** A compression pointer is marked by its top two bits, with the offset in the remaining 14. */
const POINTER_MASK = 0xc0;

/** Questions packed into one query, kept well inside a single Ethernet frame. */
const QUESTIONS_PER_QUERY = 8;

const encodeName = (name: string) => {
	const bytes: number[] = [];
	for (const label of name.replace(/\.$/, "").split(".")) {
		const encoded = new TextEncoder().encode(label);
		bytes.push(encoded.length, ...encoded);
	}
	bytes.push(0);
	return bytes;
};

/** Builds a query asking for `type` records for each name, with the unicast-response bit set. */
const buildQuery = (names: string[], type: number) => {
	const bytes: number[] = [
		0,
		0, // Transaction id; mDNS responders match on the question, so zero is conventional.
		0,
		0, // Flags: a standard query.
		0,
		names.length, // Question count.
		0,
		0, // Answer count.
		0,
		0, // Authority count.
		0,
		0, // Additional count.
	];

	const questionClass = CLASS_IN | QUESTION_UNICAST_RESPONSE;
	for (const name of names) {
		bytes.push(...encodeName(name), type >> 8, type & 0xff, questionClass >> 8, questionClass & 0xff);
	}

	return new Uint8Array(bytes);
};

/**
 * Reads a possibly-compressed domain name, returning the name and the offset just past it. A
 * pointer redirects into an earlier part of the message, so the cursor that the caller continues
 * from is the one *before* following it.
 */
const readName = (message: Uint8Array, start: number) => {
	const labels: string[] = [];
	let offset = start;
	let end: number | undefined;
	// A malformed message can point in a loop, so cap the jumps rather than spin forever.
	let jumps = 0;

	while (offset < message.length) {
		const length = message[offset];

		if (length === 0) {
			end ??= offset + 1;
			break;
		}

		if ((length & POINTER_MASK) === POINTER_MASK) {
			if (++jumps > 16) break;
			end ??= offset + 2;
			offset = ((length & ~POINTER_MASK) << 8) | message[offset + 1];
			continue;
		}

		labels.push(new TextDecoder().decode(message.subarray(offset + 1, offset + 1 + length)));
		offset += 1 + length;
	}

	return { name: labels.join("."), offset: end ?? offset };
};

type ResourceRecord = { name: string; type: number; data: Uint8Array; dataOffset: number };

/** Walks every record in a response, skipping the question section, which repeats what we asked. */
const parseRecords = (message: Uint8Array) => {
	if (message.length < 12) return [];

	const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
	const questionCount = view.getUint16(4);
	const recordCount = view.getUint16(6) + view.getUint16(8) + view.getUint16(10);

	let offset = 12;
	for (let i = 0; i < questionCount; i++) {
		offset = readName(message, offset).offset + 4; // Past the question's type and class.
	}

	const records: ResourceRecord[] = [];
	for (let i = 0; i < recordCount && offset + 10 <= message.length; i++) {
		const { name, offset: afterName } = readName(message, offset);
		const type = view.getUint16(afterName);
		const dataLength = view.getUint16(afterName + 8);
		const dataOffset = afterName + 10;
		if (dataOffset + dataLength > message.length) break;

		records.push({ name, type, data: message.subarray(dataOffset, dataOffset + dataLength), dataOffset });
		offset = dataOffset + dataLength;
	}

	return records;
};

/** `192.168.1.5` becomes `5.1.168.192.in-addr.arpa`, the name a reverse lookup asks for. */
const reverseName = (ip: string) => `${ip.split(".").reverse().join(".")}.in-addr.arpa`;

const fromReverseName = (name: string) => {
	const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\.in-addr\.arpa$/i.exec(name);
	return match ? `${match[4]}.${match[3]}.${match[2]}.${match[1]}` : undefined;
};

/**
 * Asks each address what it calls itself and returns the answers by IP. Best-effort by design: only
 * devices running an mDNS responder reply at all, so a silent address simply gets no name.
 */
export const resolveMdnsHostnames = async (ips: string[], { timeoutMs = 2_000 } = {}) => {
	const hostnames = new Map<string, string>();
	if (ips.length === 0) return hostnames;

	const record = (ip: string, name: string) => {
		const hostname = name.replace(/\.$/, "");
		// A reverse answer names the device directly, so never let an A record overwrite one.
		if (hostname && !hostnames.has(ip)) hostnames.set(ip, hostname);
	};

	const socket = await Bun.udpSocket({
		socket: {
			data: (_socket, message) => {
				for (const { name, type, data, dataOffset } of parseRecords(message)) {
					if (type === TYPE_PTR) {
						const ip = fromReverseName(name);
						// A PTR's payload is itself a name, and may be compressed against the message.
						if (ip) record(ip, readName(message, dataOffset).name);
					} else if (type === TYPE_A && data.length === 4) {
						record(data.join("."), name);
					}
				}
			},
			error: () => {},
		},
	});

	try {
		socket.setMulticastTTL(MDNS_TTL);
		socket.setMulticastLoopback(false);

		for (let i = 0; i < ips.length; i += QUESTIONS_PER_QUERY) {
			const batch = ips.slice(i, i + QUESTIONS_PER_QUERY);
			socket.send(buildQuery(batch.map(reverseName), TYPE_PTR), MDNS_PORT, MDNS_GROUP);
		}

		await Bun.sleep(timeoutMs);
	} finally {
		socket.close();
	}

	return hostnames;
};
