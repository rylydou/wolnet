import * as d from "drizzle-orm/sqlite-core";

export * from "drizzle-orm/sqlite-core";
export * from "./types";

export const id = () => d.integer().primaryKey();
export const ref = () => d.integer();

export const table = d.snakeCase.table;
