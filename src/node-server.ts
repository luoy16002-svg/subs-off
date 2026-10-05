import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app";
import type { AppEnv } from "./config";
import { getServices } from "./services";

// Local server for development and screenshots: the same API as the Worker,
// plus the static front end from public/. No AI binding here, so notes use
// the deterministic templates.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDevVars(): Record<string, string> {
  const file = join(root, ".dev.vars");
  if (!existsSync(file)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    vars[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return vars;
}

export function nodeEnv(): AppEnv {
  const vars = { ...loadDevVars(), ...process.env } as Record<string, string | undefined>;
  const env: AppEnv = {};
  for (const key of ["QLOO_API_KEY", "QLOO_BASE_URL", "QLOO_MODE", "QLOO_RECORDED_FIRST", "AI_MODE", "AI_MODEL"] as const) {
    const value = vars[key];
    if (value) env[key] = value;
  }
  return env;
}

export function startServer(port = Number(process.env.PORT ?? 5436)) {
  const env = nodeEnv();
  const api = createApp({ services: () => getServices(env) });
  const app = new Hono();
  app.route("/", api);
  app.use("/*", serveStatic({ root: join(root, "public") }));
  app.get("*", serveStatic({ path: join(root, "public", "index.html") }));
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  const services = getServices(env);
  console.log(`Subs Off running at http://127.0.0.1:${port}  (Qloo: ${services.config.mode}, notes: ${services.writer ? "workers-ai" : "templates"})`);
  for (const warning of services.config.warnings) console.warn(`warning: ${warning}`);
  return server;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) startServer();
