import { defineRelations } from "drizzle-orm";
import * as tables from "./tables";

export const relations = defineRelations(tables, (r) => ({}));
