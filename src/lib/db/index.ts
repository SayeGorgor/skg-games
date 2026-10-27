import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { config } from "dotenv";
import path from "node:path";

config({
  path: path.resolve(process.cwd(), ".env.local"),
});

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return drizzle(url, { schema });
}
