import * as env from "$env/static/private";
import type { StringValue } from "ms";
import { nanoid } from ".";

const parseBool = (value: string | undefined, defaultValue: boolean): boolean => {
	if (value === undefined) return defaultValue;
	if (value === "1") return true;
	if (value === "0") return false;
	return value.trim().toLowerCase() === "true";
};

export const newSecret = nanoid.make("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 16);

export const autoMigrate = parseBool(env.WOL_DB_AUTO_MIGRATE, true);
