# Subs Off

**Tagline:** Your taste, in another language. A week of shows, songs, books and food in the language you're learning, picked by Qloo from what you already love.

## Inspiration

People who learned a language well tend to give the same advice: watch and listen to things you'd enjoy anyway, every day. The hard part is finding them. Search for shows to learn Spanish and every list says Money Heist and Narcos. Ask a chatbot and you usually get the same list in a friendlier tone. Those are fine shows, but if your favorites are Severance and Phoebe Bridgers, they're not what gets you to sit down every evening, and the habit is the whole method.

Qloo already knows what fans of a show also like across music, books, film and food, and how taste shifts from one city to another. That's the piece language learners are missing.

## What it does

You give Subs Off four things you love, the language you're learning, your level and how many minutes a day you have. It comes back with a week:

- a series to follow all week, a film for Sunday, three artists, a book, a podcast and one restaurant near you where you can practice ordering
- a day-by-day plan that fits your time, with long episodes split into timed sittings and music counted as listening on the go
- for each pick, which of your favorites Qloo credits for the match, the taste it shares with them, how to use it at your level (English subtitles, target-language subtitles or none), an accent note when it matters (Argentine *vos*, Spain's *vosotros*) and a few phrases to listen for
- a switch to lean the week toward another city's taste: Mexico City, Madrid, Buenos Aires or Bogotá for Spanish, Paris or Montréal for French, and so on
- likes and skips that re-plan the week. A like keeps the pick and feeds it back as a signal. A skip asks why: "Seen it" removes it, "Not for me" steers away from what set it apart, "Too hard" moves that slot toward easier picks. The new week lists what changed and why.

It covers Spanish, French, Japanese, Korean, Portuguese, Italian and German. There's no sign-up: four sample learners start a full week in one click.

## How I built it

The core is an agent that plans by asking Qloo, checks what comes back and adapts. Each step streams to the browser as it finishes, and every Qloo request behind it can be opened in the app:

1. `/search` matches each favorite to a Qloo entity.
2. `/v2/insights` with `filter.type=urn:tag` reads the learner's taste profile.
3. `/v2/tags` finds the target language's own genres, like Latin Alternative or City Pop, to keep music and books in that language.
4. `/v2/insights` runs once per slot with the favorites and likes as signals, skips excluded, `filter.release_country` for film and TV, the genre tags for music, books and podcasts, `signal.location.query` for the city, `filter.location.query` for restaurants, and `feature.explainability` on.
5. The agent curates (Qloo's rank leads; level fit, skip reasons and variety only reorder close neighbors), schedules the week and writes a note for each pick from Qloo's evidence.

If the city weighting leaves too few results, the agent widens the search and says so. If taste analysis is refused, it builds the profile from the favorites' own tags.

Llama on Cloudflare Workers AI rewrites those notes in a warmer voice once the plan is on screen. It never chooses or ranks anything, and a note only replaces the template if it names a real driver, shared tag or city.

It runs as one Cloudflare Worker: Hono for the API, a Preact front end on Workers Static Assets, the Qloo key as a Worker secret, and the Workers AI binding. The Qloo client sits behind one interface with live, recorded and offline transports plus a cache, so the same code runs against the live API, against recorded answers, or fully offline in tests.

## Challenges I ran into

- **Keeping music and books in the target language.** Release country works for film and TV, but artists and books need genre tags, and semantic tag search is generous: a query for "latin pop" also returns plain "Pop". The agent only keeps tags that clearly belong to the language.
- **Honest explanations.** I wanted every "why" to come from Qloo. Explainability scores are normalized per recommendation, so the app turns them into shares of the match and shows them as a bar you can check against the request.
- **Building before the API key arrived.** I wrote the Qloo layer against the documented response shapes, with an offline stand-in that answers in the same JSON, and a recorder that captures live answers and checks their layout against the parsers once the key works.
- **Real time budgets.** A 75-minute drama doesn't fit a 20-minute day, so the schedule splits episodes into timed sittings and keeps the same series all week.

## Accomplishments that I'm proud of

- Every pick traces back to a Qloo request you can open in the app, parameters and all.
- Re-plans explain themselves, with reasons like "You passed on The House of Flowers" or "Ranks higher with Madrid audiences".
- The level and accent details come from how people actually learn: subtitles that change with level, learner podcasts for beginners, dialect notes and phrases written by hand.
- 55 tests, including a full live-mode run against a Qloo-shaped server and a record-then-replay check.

## What I learned

The Insights API rewards a clear split between signals and filters: favorites and city as signals, language and exclusions as filters. Explainability is what makes a recommendation trustworthy to a learner. And in a good agent here, the language model is the smallest part; the planning, checking and adapting matter more.

## What's next for Subs Off

- A tutor mode that plans the same week for a whole class from the students' favorites.
- Remembering the phrases you've met and bringing them back in later weeks.
- Episode-level podcast picks and exporting the week to a calendar.
- More languages and more cities per language.

## Built with

typescript, hono, preact, cloudflare-workers, workers-ai, llama, qloo-api, esbuild, vitest, playwright
