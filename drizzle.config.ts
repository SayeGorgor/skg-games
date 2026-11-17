import { defineConfig } from "drizzle-kit";
// Offline generation only: no runtime or operator credentials.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  verbose: false,
  strict: true,
});
