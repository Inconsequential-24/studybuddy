import app from "./app";
import { logger } from "./lib/logger";
import { startIngestionWorker } from "./lib/tutor-ingestion";
import { isLocalAuth } from "./lib/localAuth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Local auth has no sign-in, so only accept connections from this machine.
const host = isLocalAuth() ? "127.0.0.1" : "0.0.0.0";

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host, localAuth: isLocalAuth() }, "Server listening");
  startIngestionWorker();
});
