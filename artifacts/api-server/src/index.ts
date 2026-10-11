import app from "./app";
import { logger } from "./lib/logger";
import { startIngestionWorker } from "./lib/tutor-ingestion";
import { isLocalAuth } from "./lib/localAuth";
import { cleanupExpiredSourceChecks, resumeSourceChecks } from "./routes/source-checks";

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
// Bind both loopback addresses: browsers often open "localhost" as IPv6 (::1).
const hosts = isLocalAuth() ? ["127.0.0.1", "::1"] : ["0.0.0.0"];
let started = false;

function startBackgroundWork() {
  if (started) return;
  started = true;
  startIngestionWorker();
  resumeSourceChecks();
  const cleanupSourceChecks = () => {
    void cleanupExpiredSourceChecks().catch((err) => logger.warn({ err }, "Source-check cleanup pass failed"));
  };
  cleanupSourceChecks();
  const cleanupInterval = setInterval(cleanupSourceChecks, 60 * 60 * 1000);
  cleanupInterval.unref();
}

for (const [index, host] of hosts.entries()) {
  const required = index === 0;
  const server = app.listen(port, host, () => {
    logger.info({ port, host, localAuth: isLocalAuth() }, "Server listening");
    startBackgroundWork();
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (!required && (err.code === "EADDRINUSE" || err.code === "EAFNOSUPPORT" || err.code === "EINVAL")) {
      logger.warn({ err, host }, "Optional localhost listen failed");
      return;
    }
    logger.error({ err, host }, "Error listening on port");
    process.exit(1);
  });
}
