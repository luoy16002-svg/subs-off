// npm run shots: builds the app, serves it on 127.0.0.1:5438, and captures
// every main state at 1440x900 and 390x844 with Playwright's bundled
// Chromium into qa/. Uses whatever Qloo mode the environment selects.
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { startServer } from "../src/node-server";
import { buildWeb } from "./build-web";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "qa");
const port = Number(process.env.SHOTS_PORT ?? 5438);
const base = `http://127.0.0.1:${port}`;
const only = process.argv[2];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function settle(page: Page, ms = 350) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

async function shot(page: Page, view: string, name: string, options: { fullPage?: boolean } = {}) {
  const file = join(out, `${view}-${name}.png`);
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false });
  console.log(`  ${view}-${name}.png`);
}

async function scrollTo(page: Page, selector: string, offset = 16) {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel as string);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (off as number), behavior: "instant" as ScrollBehavior });
    },
    [selector, offset] as const,
  );
  await page.waitForTimeout(250);
}

async function run() {
  mkdirSync(out, { recursive: true });
  await buildWeb();
  const server = startServer(port);
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      if (only && only !== viewport.name) continue;
      const view = viewport.name;
      console.log(`${view}:`);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "no-preference" });
      const page = await context.newPage();
      page.on("pageerror", (error) => console.error(`  page error: ${error.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") console.error(`  console: ${msg.text()}`);
      });

      // Home
      await page.goto(`${base}/#/`);
      await settle(page, 900);
      await shot(page, view, "01-home");
      await scrollTo(page, ".learners");
      await shot(page, view, "02-home-learners");
      await scrollTo(page, "#how");
      await shot(page, view, "03-home-how");

      // Builder: empty, validation, typeahead
      await page.goto(`${base}/#/build`);
      await settle(page);
      await shot(page, view, "04-builder-empty");
      await page.click("button[type=submit]");
      await page.waitForTimeout(200);
      await scrollTo(page, ".field--favorites", 90);
      await shot(page, view, "05-builder-needs-favorites");
      for (const name of ["Fleabag", "Mitski"]) {
        await page.fill("#fav-input", name);
        await page.waitForSelector(".combo__list li");
        await page.keyboard.press("Enter");
      }
      await page.fill("#fav-input", "the be");
      await page.waitForSelector(".combo__list li");
      await page.waitForTimeout(150);
      await scrollTo(page, ".field--favorites", 90);
      await shot(page, view, "06-builder-typeahead");
      await page.keyboard.press("Enter");
      await page.click(".segmented button:has-text('French')");
      await page.click(".level:has-text('Advanced')");
      await page.fill("#home", "New York");
      await scrollTo(page, ".levels", 120);
      await shot(page, view, "07-builder-filled");

      // Working state, then the finished plan
      await page.click("button[type=submit]");
      await page.waitForSelector(".working .trace__step");
      await page.waitForTimeout(120);
      await shot(page, view, "08-agent-working");
      await page.waitForSelector(".picks__grid .pick");
      await settle(page, 700);
      await shot(page, view, "09-plan-top");

      // Sample learner plan (Maya) for the detailed states
      await page.goto(`${base}/#/`);
      await settle(page);
      await page.click(".learner:has-text('Maya')");
      await page.waitForSelector(".picks__grid .pick", { timeout: 15000 });
      await settle(page, 800);
      await shot(page, view, "10-plan-week");
      await scrollTo(page, ".picks");
      await shot(page, view, "11-plan-picks");
      const series = page.locator(".pick--feature").first();
      await series.locator(".evidence-toggle").click();
      await page.waitForTimeout(400);
      await scrollTo(page, ".pick--feature .evidence", 120);
      await shot(page, view, "12-pick-evidence");
      await scrollTo(page, ".side", 16);
      const firstToggle = page.locator(".side .trace__toggle").nth(3);
      await firstToggle.click();
      await page.waitForTimeout(250);
      await scrollTo(page, ".side .calls", 140);
      await shot(page, view, "13-trace-requests");

      // Feedback: like a song, skip the series as "not for me"
      const music = page.locator(".pick:has(.pick__slot:has-text('Music'))").first();
      await music.locator("button:has-text('Like')").click();
      await series.locator("button:has-text('Skip')").click();
      await scrollTo(page, ".pick--feature", 90);
      await shot(page, view, "14-skip-reasons");
      await series.locator("button:has-text('Not for me')").click();
      await page.waitForSelector(".replan");
      await page.waitForTimeout(500);
      await shot(page, view, "15-replan-bar");
      await page.click(".replan .btn--sub");
      await page.waitForSelector(".changes", { timeout: 15000 });
      await settle(page, 900);
      await scrollTo(page, ".changes", 24);
      await shot(page, view, "16-replanned");

      // Full-page reference of the finished plan
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, view, "17-plan-full", { fullPage: true });

      // Error state: the planner fails
      await page.route("**/api/plan", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "QLOO_RATE_LIMIT", message: "Qloo is busy right now. Try again in a minute.", retryable: true } }) }));
      await page.goto(`${base}/#/`);
      await settle(page);
      await page.click(".learner:has-text('Leo')");
      await page.waitForSelector(".error-panel");
      await settle(page, 300);
      await shot(page, view, "18-error");
      await page.unroute("**/api/plan");

      // Dark mode plan
      const dark = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, colorScheme: "dark" });
      const darkPage = await dark.newPage();
      await darkPage.goto(`${base}/#/sample/priya`);
      await darkPage.waitForSelector(".picks__grid .pick", { timeout: 15000 });
      await settle(darkPage, 800);
      await shot(darkPage, view, "19-dark-plan");
      await darkPage.goto(`${base}/#/`);
      await settle(darkPage, 900);
      await shot(darkPage, view, "20-dark-home");
      await dark.close();
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
