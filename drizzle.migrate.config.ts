import { defineConfig } from "drizzle-kit";
import { approvedDbTarget } from "./scripts/lib/db-target";
// No dotenv/fallback. Prefer db:migrate, which verifies server identity too.
const target = approvedDbTarget(process.env, "MIGRATION");
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: target.url },
  verbose: false,
  strict: true,
});
