import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { envs } from "../config/envs";
import * as schema from "./schema";

const client = postgres(envs.db.DATABASE_URL);
export const db = drizzle(client, { schema });
