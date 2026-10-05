// npm run dev: rebuilds the front end on change and serves the app plus API
// on http://127.0.0.1:5436 (override with PORT, kept within 5430-5439).
import { startServer } from "../src/node-server";
import { watchWeb } from "./build-web";

const port = Number(process.env.PORT ?? 5436);
if (port < 5430 || port > 5439) {
  console.error("Use a PORT between 5430 and 5439.");
  process.exit(1);
}

const ctx = await watchWeb();
const server = startServer(port);

const stop = async () => {
  await ctx.dispose();
  server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
