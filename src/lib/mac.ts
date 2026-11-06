// The database stores a MAC address as one number. It's 48 bits wide, which is too big for
// JavaScript's 32-bit bitwise operators, so these use plain arithmetic instead.

/** Matches `00:1a:2b:3c:4d:5e`, `00-1A-2B-3C-4D-5E` and `001a2b3c4d5e`. */
export const MAC_ADDRESS_PATTERN = /^[0-9a-f]{2}(?:([:-])[0-9a-f]{2}(?:\1[0-9a-f]{2}){4}|(?:[0-9a-f]{2}){5})$/i;

/** Turns a MAC address into the number stored in the database, or `undefined` if it's malformed. */
export const parseMacAddress = (address: string) => {
	if (!MAC_ADDRESS_PATTERN.test(address)) return undefined;

	const hex = address.replace(/[:-]/g, "");
	return Number.parseInt(hex, 16);
};

/** Turns a stored MAC address number back into `00:1a:2b:3c:4d:5e` form. */
export const formatMacAddress = (value: number) =>
	value
		.toString(16)
		.padStart(12, "0")
		.replace(/(..)(?!$)/g, "$1:");

/** The 6 raw bytes of a stored MAC address, most significant first. */
export const macAddressBytes = (value: number) =>
	Uint8Array.from({ length: 6 }, (_, i) => Math.floor(value / 0x100 ** (5 - i)) % 0x100);
