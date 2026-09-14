import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Run relative to this package's own directory (packages/core), which is how
// every script in this file is invoked (drizzle-kit CLI, tsx scripts).
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://kraken_memes:kraken_memes@localhost:5432/kraken_memes",
  },
});
