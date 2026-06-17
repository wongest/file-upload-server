import { app } from "./app";
import { config } from "./config";

const server = app.listen(config.port, config.host, () => {
  console.log(`file-upload-server listening on ${config.host}:${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`received ${signal}, shutting down`);

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
