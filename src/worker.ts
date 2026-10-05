import { createApp } from "./app";
import type { AppEnv } from "./config";
import { getServices } from "./services";

// Cloudflare Worker entry. Static files are served by Workers Static Assets;
// only /api/* reaches this code (see run_worker_first in wrangler.toml).
const app = createApp({ services: getServices });

export default {
  async fetch(request: Request, env: AppEnv, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx as never);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
