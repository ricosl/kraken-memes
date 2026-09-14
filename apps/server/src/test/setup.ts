import "../env.js";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://kraken_memes:kraken_memes@localhost:5432/kraken_memes";
}
