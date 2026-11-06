/** Logs a line with the time in front, for things worth looking back on, like a device going on or off. */
export const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
