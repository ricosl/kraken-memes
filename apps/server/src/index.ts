import "./env.js";
import { createApp } from "./app.js";
import { configureWebPush } from "./push/webpush.js";
import { logger } from "./logger.js";

configureWebPush();

const app = createApp();
const port = Number(process.env.SERVER_PORT) || 4000;

app.listen(port, () => {
  logger.info("server_started", { port });
});
