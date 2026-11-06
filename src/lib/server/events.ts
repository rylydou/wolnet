/**
 * Lets the live device list in the web UI wait for the next change: a device being added, edited,
 * or removed, or going on or off.
 */

const listeners = new Set<() => void>();

/** Resolves the next time anything about the device list changes. */
export const nextChange = () => new Promise<void>((resolve) => listeners.add(resolve));

export const notifyChange = () => {
	for (const listener of listeners) listener();
	listeners.clear();
};
