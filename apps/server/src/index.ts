import { configureWebPush, logger } from "@kraken-memes/core";
import { createApp } from "./app.js";

configureWebPush();

const app = createApp();
// Render (and most PaaS hosts) assign the port via $PORT; SERVER_PORT remains
// for local/dev use where that convention doesn't apply.
const port = Number(process.env.PORT) || Number(process.env.SERVER_PORT) || 4000;

app.listen(port, () => {
  logger.info("server_started", { port });
});
