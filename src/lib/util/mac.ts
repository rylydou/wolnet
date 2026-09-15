// A MAC address is 48 bits wide, so it is packed and unpacked with arithmetic rather than
// bitwise operators, which would silently truncate it to 32 bits.

const MAC_ADDRESS_BYTES = 6;

/** Matches `00:1a:2b:3c:4d:5e`, `00-1A-2B-3C-4D-5E` and `001a2b3c4d5e`. */
export const MAC_ADDRESS_PATTERN = /^[0-9a-f]{2}(?:([:-])[0-9a-f]{2}(?:\1[0-9a-f]{2}){4}|(?:[0-9a-f]{2}){5})$/i;

/** Packs a MAC address into the integer stored in the database, or `undefined` if it is malformed. */
export const parseMacAddress = (address: string) => {
	if (!MAC_ADDRESS_PATTERN.test(address)) return undefined;

	const hex = address.replace(/[:-]/g, "");

	let value = 0;
	for (let i = 0; i < hex.length; i += 2) {
		value = value * 0x100 + Number.parseInt(hex.slice(i, i + 2), 16);
	}

	return value;
};

/** Unpacks a stored MAC address integer back into its canonical `00:1a:2b:3c:4d:5e` form. */
export const formatMacAddress = (value: number) => {
	const bytes: string[] = [];
	for (let i = MAC_ADDRESS_BYTES - 1; i >= 0; i--) {
		bytes.push((Math.floor(value / 0x100 ** i) % 0x100).toString(16).padStart(2, "0"));
	}

	return bytes.join(":");
};
