import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load the monorepo-root .env regardless of which app's cwd this runs from,
// falling back to a local .env in this app if present.
const rootEnv = path.resolve(fileURLToPath(import.meta.url), "../../../../.env");
config({ path: rootEnv });
config(); // also load a local .env if present, without overriding root values
