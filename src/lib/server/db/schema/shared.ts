import * as d from "drizzle-orm/sqlite-core";

export * from "drizzle-orm/sqlite-core";

export const id = () => d.integer().primaryKey();
export const ref = () => d.integer();
export const timestamp = () => d.integer({ mode: "timestamp" });

export const table = d.snakeCase.table;
