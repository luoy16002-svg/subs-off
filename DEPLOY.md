# Deploying Subs Off

The app is one Cloudflare Worker. Workers Static Assets serves the front end from `public/`, the Worker answers `/api/*`, and a Workers AI binding writes the optional notes. The Qloo key lives only in a Worker secret.

All commands run from the repository root (this folder).

## 1. Install

```sh
npm install
npm test
```

## 2. Check the Qloo key (local)

```sh
cp .dev.vars.example .dev.vars
# edit .dev.vars and set QLOO_API_KEY=<the key from the Qloo email>
npm run qloo:check
```

Expected: three lines for `/search`, `/v2/insights` and `/v2/tags`, then `Qloo is reachable with this key.` A `QLOO_AUTH` error means the key or base URL is wrong; the key only works against `https://hackathon.api.qloo.com`.

## 3. Record live answers for the sample learners

```sh
npm run record -- --fresh
```

This runs the four sample learners, plus the like-and-skip re-plan a visitor is most likely to try, against the live API, and writes:

- `fixtures/recorded.json`: trimmed responses, bundled into the Worker and served first for these requests, so the demo is instant and spares the event quota.
- `fixtures/record-report.json`: what each learner got, and checks of the live response layout.

Open the report and look at `checks`:

- `failures` should be empty.
- `explainedCallsWithParsedContributions` should be above 0. If it is 0, the explainability layout differs from what `parseContributions` in `src/qloo/parse.ts` expects; `sampleExplainability` shows the real layout.
- Skim `learners[].picks` to make sure the picks are in the right language. If music or books drift, adjust the tag queries for that language in `src/agent/locales.ts` and record again.

Then retake the screenshots with live data and commit everything:

```sh
npm run shots
git add fixtures qa
git commit -m "Record live Qloo answers for the sample learners"
```

`npm run shots` uses the key from `.dev.vars`, so the screenshots show live data.

## 4. Deploy

```sh
npx wrangler login              # opens a browser once
npx wrangler deploy             # runs npm run build, uploads the Worker and public/
npx wrangler secret put QLOO_API_KEY
# paste the key when prompted
```

`wrangler deploy` prints the URL, for example `https://subs-off.<your-subdomain>.workers.dev`. Setting the secret switches the running Worker to live mode; no redeploy is needed.

## 5. Verify

```sh
curl https://subs-off.<your-subdomain>.workers.dev/api/health
```

Expected: `"mode":"live"`, `"writer":{"kind":"workers-ai",...}`, `"warnings":[]` and `recordedResponses` above 0. Then open the site, pick Maya, open "How this week was built" and expand a step: its requests should say "Recorded from Qloo on <date>" or "Live from Qloo". Build a custom week with a favorite that isn't in the samples to see fully live calls.

## Switching modes

Everything is controlled by `[vars]` in `wrangler.toml` and the one secret.

| Want | Do |
| --- | --- |
| Live Qloo | Set the `QLOO_API_KEY` secret. `QLOO_MODE = "auto"` (default) uses live whenever the key exists. |
| Offline sample data | `QLOO_MODE = "fixtures"`, then `npx wrangler deploy`. |
| Always call Qloo, even for recorded requests | `QLOO_RECORDED_FIRST = "false"`. Recordings are still used if Qloo is briefly down. |
| Template notes only | `AI_MODE = "off"`. |
| Another Workers AI model | `AI_MODEL = "<model id>"`; `AI_FALLBACK_MODELS` is tried next. |
| Remove the key | `npx wrangler secret delete QLOO_API_KEY` (the app falls back to offline data and says so). |

If `/api/health` shows a warning like `QLOO_MODE is live but QLOO_API_KEY is not set`, the secret is missing.

## Workers AI usage

Workers AI has a free daily allocation; check Cloudflare's current pricing page for the numbers. Notes are cached per plan, limited to 20 calls a minute and `AI_DAILY_LIMIT` (300) calls a day per isolate, and the app falls back to template notes on any error. On the Workers Free plan, going over the allocation only makes notes fall back to templates. On Workers Paid, usage above the allocation is billed, so lower `AI_DAILY_LIMIT` or set `AI_MODE = "off"` if that matters.

## Optional: shared cache across isolates

```sh
npx wrangler kv namespace create QLOO_CACHE
```

Paste the printed id into the commented `[[kv_namespaces]]` block in `wrangler.toml`, uncomment it, and deploy. Live Qloo answers are then shared between isolates for three days.

## Publishing the repository

```sh
git remote add origin https://github.com/<user>/subs-off.git
git push -u origin main
```

- `LICENSE` (MIT) sits at the repository root, so GitHub shows it in the About section.
- In the repository's About settings, add a one-line description, the live URL as the website, and a few topics (qloo, language-learning, cloudflare-workers).
- Add the live URL near the top of `README.md`.

## Devpost

- Text fields: `DEVPOST.md`.
- Demo link: the workers.dev URL. Repository link: the GitHub URL.
- Images: `qa/desktop-01-home.png`, `qa/desktop-10-plan-week.png`, `qa/desktop-12-pick-evidence.png`, `qa/desktop-16b-city-switch.png`, `qa/mobile-10-plan-week.png`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `QLOO_AUTH` / 401 | Wrong key, or a base URL other than `https://hackathon.api.qloo.com`. |
| A slot is missing and its trace step says "skipped" | Qloo returned nothing or refused that entity type for this key. The rest of the week still builds. |
| `QLOO_RATE_LIMIT` / 429 | Too many calls in a short time. Recorded answers and the cache absorb repeat visits; wait a minute. |
| Notes never change from templates | No AI binding, `AI_MODE = "off"`, the daily limit reached, or the model id is unavailable. Check `/api/health`. |
| Error 1102 (Worker exceeded CPU) on plan requests | The Workers Free plan gives each request a small CPU budget. The agent itself uses about 1.5 ms per plan and asks Qloo for 12 results per slot to keep parsing light; if this still appears, the Workers Paid plan removes the limit. |

## Optional: cross-check with the kit's CLI

The Worker calls the same REST endpoints that `qloo api` uses. To compare answers with the official harness:

```sh
npm install --global @qloo/qloo-harness
qloo setup --qloo
QLOO_BASE_URL=https://hackathon.api.qloo.com QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com qloo api search --query "Severance" --take 1 --json
```

## Local Worker without an account

```sh
npm run dev:worker     # workerd on http://127.0.0.1:5437, offline data, no AI binding
```
