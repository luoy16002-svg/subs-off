# Design notes

## The idea, and why it stayed

The starting idea was taste-matched immersion for language learners: take a few things someone already loves and build a week of series, music, books and food in the language they're learning. After reading the hackathon kit, the developer guide and the Insights reference, I kept it, for four reasons:

1. **It needs exactly what Qloo has.** The picks must cross domains (a TV favorite leading to music and books), be filtered to a language (release country, genre tags), and lean toward a city's taste (`signal.location.query`). Each of those is a documented Insights parameter, and none of them is something an LLM can do from memory with real audience data behind it.
2. **Qloo can explain itself.** `feature.explainability` reports which input entities drove each recommendation. That turns "why this pick" into evidence instead of generated prose, which matters for a product people should trust.
3. **A real audience with a real habit problem.** Comprehensible-input learners are told to watch and listen to things they enjoy. The hard part is finding them, and the generic lists are the same everywhere.
4. **Not a chatbot.** The product is a plan you act on, with a feedback loop, not a prompt box.

Alternatives I considered and dropped: a travel itinerary planner (crowded, and Qloo's place data is one domain of many), a gift finder (thin feedback loop), a dining concierge (single domain). They use less of the graph.

## How the app talks to Qloo

The kit offers `qloo exec`, `qloo api` and `qloo mcp`. The MCP starter says plainly that serverless functions can't start `qloo mcp`, and a Worker can't spawn processes at all. The developer guide documents the REST API directly: `https://hackathon.api.qloo.com`, the key in an `X-Api-Key` header, GET with query parameters. `qloo api` calls those same endpoints, so the Worker calls them too, through one client in `src/qloo/`:

| Endpoint | Used for | Notes |
| --- | --- | --- |
| `/search` | resolving each favorite to a Qloo ID | exact-name match first, then the top result, shown to the user as "closest match" |
| `/entities` | reloading liked picks that a new round no longer returns | |
| `/v2/insights` with `filter.type=urn:tag` | the learner's taste profile | if refused or empty, the profile is built from the favorites' own tags |
| `/v2/tags` | the target language's genres for music, books, podcasts and food | queried with `feature.semantic_search`; candidates are scoped locally by `parents`, the way the kit's own resolver does it, and kept only if the name matches the language (so "latin pop" doesn't drag in plain "Pop") |
| `/v2/insights` with entity types | every pick | favorites and likes as `signal.interests.entities`, skips in `filter.exclude.entities`, `filter.release_country` for film and TV, `filter.tags` for the rest, `signal.location.query` for the city, `filter.location.query` for restaurants, `feature.explainability=true` |

Every request goes through a canonical form (sorted keys, sorted set values) so caches and recordings line up exactly.

### One interface, four transports

- **Live**: REST with timeouts, bounded retries on 429 and 5xx (honoring `Retry-After`), and errors mapped to clear codes. HTTPS only.
- **Recorded**: exact answers saved by `npm run record`, trimmed to the fields the app reads but with Qloo's structure and key names unchanged. In live mode these are served first for the sample learners, and used as a fallback when Qloo is briefly unavailable. Live mode never falls back to simulated data.
- **Offline simulator**: a hand-written catalog of 214 entries (28 well-known favorites to start from, and 186 series, films, artists, books, podcasts and places in Spanish, French, Japanese and Korean) behind a stand-in that answers `/search`, `/entities`, `/v2/tags` and `/v2/insights` in the documented shapes, including explainability and locality. Its scores are a tag-overlap model, not Qloo's graph. It exists so the app, the tests and the screenshots run without a key, and the UI labels its data as offline sample data.
- **Cache**: memory, plus Workers KV when bound. A cached answer keeps its original source label.

Switching to live is one secret: `QLOO_API_KEY`. `QLOO_MODE` can force either mode.

### Unknowns, and how the code handles them

The API key wasn't available while building, so a few response details couldn't be confirmed. Each is handled defensively and checked by the recorder:

- **Explainability layout.** The reference describes the meaning (input entities with scores from 0 to 1) but not one fixed JSON layout. `parseContributions` walks the object and accepts arrays of `{entity_id, score}` with or without a signal key, and plain ID-to-score maps. The record report counts how many live calls produced parsed contributions and keeps a sample of the raw layout.
- **`/search` and `/entities` list layout.** Both `results: [...]` and `results: {entities: [...]}` are accepted, as the kit's own CLI does.
- **Tag parent metadata.** Used when present, ignored when absent.
- **Location signal on media types.** The location guide shows it on movies; if Qloo returns too few results with it, the agent drops it and says so in the plan.
- **Country names.** Korea is sent as both "South Korea" and "Korea, Republic of" (union), since the release-country vocabulary isn't listed.

## The agent loop

`src/agent/planner.ts` runs these steps and streams each one to the browser as it finishes:

1. **Match favorites** with `/search` (in parallel).
2. **Read taste** with a `urn:tag` insights call.
3. **Find the language's genres** with `/v2/tags`.
4. **Scout six slots** in parallel: series, film, music, book, podcast, restaurant. Each slot widens its own search when results run thin (drop the city weighting first), skips cleanly when Qloo has nothing, and records what it did.
5. **Curate.** Qloo's rank carries 75% of the score; affinity adds the rest. Level fit nudges close neighbors (beginners: comedy, animation, reality, short episodes and learner podcasts; advanced: no learner podcasts). "Not for me" skips push down tags that set the skipped item apart from the favorites. Liked picks stay pinned. Earlier picks that still rank in their slot's top four are kept, so a re-plan changes only what it should. The three artists are chosen with a diversity penalty.
6. **Schedule** seven days: the same series all week, timed sittings when an episode is longer than the daily budget, music and podcasts as listening on the go, the restaurant on Saturday, the film on Sunday.
7. **Explain** each pick from evidence: the favorites Qloo credits, the taste tags it shares with them, and the city weighting.

A re-plan sends likes, skips (with their reasons and tags), the previous picks and, when the city changed, the previous city. The response lists each change with a reason: "You passed on X", "X felt too hard, so this one is gentler", "Ranks higher with Madrid audiences", "It leans on your like of Y".

## Where the LLM fits

Workers AI (Llama 3.3 70B, with Llama 3.1 8B as fallback) only rewrites the notes after the plan is on screen. It gets the evidence for each pick and a template draft. A note is accepted only if it is 20 to 220 characters, names at least one real driver, shared tag or city, and avoids a list of stock marketing phrases; dashes are normalized and exclamation marks removed. Everything else keeps the template. Calls are cached per plan, limited per minute and per day, and time out after seven seconds.

## Front end

Preact, built with esbuild into hashed bundles (about 56 KB of JS and 32 KB of CSS before compression).

- **Look.** A subtitle motif: one accent (subtitle yellow), off-black film frames with soft seeded light, captions set where subtitles sit (the title as originally released). Bricolage Grotesque for display, Geist for text, Geist Mono for the API trace, all self-hosted. Tabler icons. Light and dark themes from the system setting.
- **States.** Home with a live subtitle screen and four sample learners; builder with typeahead over Qloo search, validation and quick picks; the agent at work, streaming real steps; the plan; evidence per pick; the trace with every request; skip reasons; the re-plan bar; what changed; city switch; error with retry; the offline label. Every screen is captured at 1440x900 and 390x844 in `qa/`.
- **Motion.** Only where it carries meaning: the subtitle screen, steps arriving, cards entering, the highlight on picks that are new after a re-plan. All of it respects reduced motion.

## Safety and data

- Qloo receives titles, IDs, tag IDs and city names only. The learner's name never leaves the browser.
- The key is a Worker secret, never sent to the browser, never logged, and never written to recordings (a test checks this).
- Picks with tags or names about politics or adult content are dropped before curation.
- Results are presented as aggregate affinities ("people who love X tend to rate this highly"), following the kit's safe-use notes.
- Per-client rate limits protect the event quota; repeated questions are answered from the cache.
