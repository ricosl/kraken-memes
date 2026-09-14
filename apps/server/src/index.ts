import { configureWebPush, logger } from "@kraken-memes/core";
import { createApp } from "./app.js";

configureWebPush();

const app = createApp();
const port = Number(process.env.SERVER_PORT) || 4000;

app.listen(port, () => {
  logger.info("server_started", { port });
});
