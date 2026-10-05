import { IconCloudOff, IconRefresh } from "@tabler/icons-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { AgentEvent, LearnerInput, Pick, Plan, SkipReason, TraceStep } from "../src/agent/types";
import { Builder } from "./components/Builder";
import { Home } from "./components/Home";
import { PlanPage, type Feedback, type PlanStatus } from "./components/PlanPage";
import { STROKE, Wordmark } from "./components/visual";
import { ApiError, fetchConfig, streamPlan, type AppConfig } from "./lib/api";
import * as store from "./lib/store";

type Route = { name: "home" } | { name: "build" } | { name: "week" } | { name: "sample"; id: string };

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "build") return { name: "build" };
  if (hash === "week") return { name: "week" };
  const sample = /^sample\/([a-z0-9-]+)$/.exec(hash);
  if (sample) return { name: "sample", id: sample[1]! };
  return { name: "home" };
}

function go(path: string) {
  if (window.location.hash !== `#/${path}`) window.location.hash = `/${path}`;
}

const EMPTY: Feedback = { likes: {}, skips: {} };

function feedbackKey(feedback: Feedback): string {
  const likes = Object.keys(feedback.likes).sort().join(",");
  const skips = Object.entries(feedback.skips)
    .map(([id, s]) => `${id}:${s.reason}`)
    .sort()
    .join(",");
  return `${likes}|${skips}`;
}

function applyNotes(plan: Plan, notes: Extract<AgentEvent, { type: "notes" }>): Plan {
  return {
    ...plan,
    writer: "workers-ai",
    intro: notes.intro ?? plan.intro,
    picks: plan.picks.map((pick) => (notes.whys[pick.id] ? { ...pick, why: notes.whys[pick.id]! } : pick)),
  };
}

function errorCopy(code: string | undefined, message: string, retryable: boolean) {
  const titles: Record<string, string> = {
    NO_FAVORITES: "Qloo couldn't find those favorites",
    NO_RESULTS: "Nothing matched this time",
    QLOO_RATE_LIMIT: "Qloo is busy",
    QLOO_AUTH: "This copy can't reach Qloo",
    RATE_LIMIT: "That's a lot of weeks",
    BAD_INPUT: "Something in the form needs a fix",
  };
  return { title: titles[code ?? ""] ?? "The week didn't come together", message, retryable };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function App() {
  const saved = useRef(store.load());
  const [config, setConfig] = useState<AppConfig>();
  const [configError, setConfigError] = useState<string>();
  const [route, setRoute] = useState<Route>(parseHash);
  const [learner, setLearner] = useState<LearnerInput | undefined>(saved.current.learner as LearnerInput | undefined);
  const [plan, setPlan] = useState<Plan | undefined>(saved.current.plan as Plan | undefined);
  const [status, setStatus] = useState<PlanStatus>(saved.current.plan ? "ready" : "loading");
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [error, setError] = useState<ReturnType<typeof errorCopy>>();
  const [feedback, setFeedback] = useState<Feedback>((saved.current.feedback as Feedback | undefined) ?? EMPTY);
  const [appliedKey, setAppliedKey] = useState(feedbackKey((saved.current.feedback as Feedback | undefined) ?? EMPTY));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>();
  const abortRef = useRef<AbortController>();

  const loadConfig = () => {
    setConfigError(undefined);
    fetchConfig().then(setConfig, (e: Error) => setConfigError(e.message));
  };
  useEffect(loadConfig, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = route.name === "week" && learner ? `${learner.name ? `${learner.name}'s week` : "Your week"} | Subs Off` : route.name === "build" ? "Build your week | Subs Off" : "Subs Off | Your taste, in another language";
  }, [route.name]);

  useEffect(() => {
    store.save({ learner, plan, feedback });
  }, [learner, plan, feedback]);

  const run = async (input: LearnerInput, replan: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const previous = plan;
    setSteps([]);
    setError(undefined);
    setNotice(undefined);
    setStatus(replan ? "replanning" : "loading");
    if (!replan) {
      setPlan(undefined);
      setNewIds(new Set());
    }
    const started = performance.now();
    const collected: TraceStep[] = [];
    let shown: Promise<void> | undefined;
    let failure: { code?: string; message: string; retryable: boolean } | undefined;

    try {
      await streamPlan(
        input,
        (event) => {
          if (controller.signal.aborted) return;
          if (event.type === "step") {
            collected.push(event.step);
            setSteps([...collected]);
          } else if (event.type === "plan") {
            const next = event.plan;
            shown = (async () => {
              // Keep the agent's work on screen long enough to read on first load.
              const wait = replan ? 0 : Math.max(0, 1100 - (performance.now() - started));
              if (wait) await sleep(wait);
              if (controller.signal.aborted) return;
              if (replan && previous) setNewIds(new Set(next.picks.filter((p) => !previous.picks.some((q) => q.id === p.id)).map((p) => p.id)));
              setPlan(next);
              setStatus("ready");
            })();
          } else if (event.type === "notes") {
            const notes = event;
            void (shown ?? Promise.resolve()).then(() => setPlan((current) => (current ? applyNotes(current, notes) : current)));
          } else if (event.type === "error") {
            failure = event.error;
          }
        },
        controller.signal,
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      failure = { message: (e as Error).message, retryable: e instanceof ApiError ? e.retryable : true };
    }
    if (controller.signal.aborted) return;
    if (failure) {
      setError(errorCopy(failure.code, failure.message, failure.retryable));
      if (replan && previous) {
        setPlan(previous);
        setStatus("ready");
        setNotice(`The re-plan didn't go through. ${failure.message}`);
      } else {
        setStatus("error");
      }
      return;
    }
    await shown;
  };

  const start = (input: LearnerInput) => {
    window.scrollTo({ top: 0 });
    setLearner(input);
    setFeedback(EMPTY);
    setAppliedKey(feedbackKey(EMPTY));
    go("week");
    void run(input, false);
  };

  // Deep link: #/sample/maya builds that learner's week straight away.
  useEffect(() => {
    if (!config || route.name !== "sample") return;
    const sample = config.samples.find((s) => s.id === route.id);
    if (sample) start(sample.input);
    else go("");
  }, [config, route]);

  const like = (pick: Pick) => {
    const likes = { ...feedback.likes, [pick.id]: { id: pick.id, name: pick.name, slot: pick.slot } };
    const skips = { ...feedback.skips };
    delete skips[pick.id];
    setFeedback({ likes, skips });
  };
  const skip = (pick: Pick, reason: SkipReason) => {
    const skips = { ...feedback.skips, [pick.id]: { id: pick.id, name: pick.name, slot: pick.slot, reason, tagIds: pick.tags.map((t) => t.id) } };
    const likes = { ...feedback.likes };
    delete likes[pick.id];
    setFeedback({ likes, skips });
  };
  const undo = (pick: Pick) => {
    const likes = { ...feedback.likes };
    const skips = { ...feedback.skips };
    delete likes[pick.id];
    delete skips[pick.id];
    setFeedback({ likes, skips });
  };
  const replan = async () => {
    if (!learner || !plan) return;
    const key = feedbackKey(feedback);
    const input: LearnerInput = {
      ...learner,
      likes: Object.values(feedback.likes),
      skips: Object.values(feedback.skips),
      previous: plan.picks.map((p) => ({ slot: p.slot, id: p.id, name: p.name })),
    };
    await run(input, true);
    setAppliedKey(key);
  };
  const changeCity = async (slug: string) => {
    if (!learner || !plan || slug === learner.targetCity) return;
    const key = feedbackKey(feedback);
    const next: LearnerInput = { ...learner, targetCity: slug };
    setLearner(next);
    await run(
      {
        ...next,
        likes: Object.values(feedback.likes),
        skips: Object.values(feedback.skips),
        previous: plan.picks.map((p) => ({ slot: p.slot, id: p.id, name: p.name })),
        previousCity: learner.targetCity,
      },
      true,
    );
    setAppliedKey(key);
  };
  const clearFeedback = () => {
    // Drop pending changes only; feedback the current week already used stays.
    const kept: Feedback = { likes: {}, skips: {} };
    for (const [id, like] of Object.entries(feedback.likes)) if (appliedKey.split("|")[0]!.split(",").includes(id)) kept.likes[id] = like;
    for (const [id, s] of Object.entries(feedback.skips)) if (appliedKey.split("|")[1]!.includes(`${id}:${s.reason}`)) kept.skips[id] = s;
    setFeedback(kept);
  };

  const nav = (
    <header class="topbar">
      <a class="topbar__brand" href="#/" aria-label="Subs Off, home">
        <Wordmark />
      </a>
      <nav class="topbar__nav" aria-label="Main">
        {route.name === "home" ? (
          <a class="topbar__link" href="#how" onClick={(e) => (e.preventDefault(), document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }))}>
            How it works
          </a>
        ) : null}
        {route.name !== "build" ? (
          <button type="button" class="btn btn--ink btn--sm" onClick={() => go("build")}>
            Build my week
          </button>
        ) : null}
      </nav>
    </header>
  );

  const footer = (
    <footer class="footer">
      <Wordmark />
      <p>Picks and rankings come from Qloo's taste graph. Notes are written by Llama on Cloudflare Workers AI, or by plain templates.</p>
      {config?.mode === "fixtures" ? <p class="footer__mode">This copy is running on offline sample data shaped like the Qloo API.</p> : null}
    </footer>
  );

  if (configError) {
    return (
      <div class="shell">
        {nav}
        <main id="main" class="error-panel error-panel--page" role="alert">
          <IconCloudOff size={28} stroke={STROKE} aria-hidden="true" />
          <h2>The app server didn't answer</h2>
          <p>{configError}</p>
          <div class="error-panel__actions">
            <button type="button" class="btn btn--sub" onClick={loadConfig}>
              <IconRefresh size={16} stroke={STROKE} aria-hidden="true" /> Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!config) {
    return (
      <div class="shell">
        {nav}
        <main id="main" class="boot" aria-busy="true">
          <span class="spinner" aria-hidden="true" />
        </main>
      </div>
    );
  }

  let page;
  if (route.name === "build") {
    page = <Builder config={config} initial={learner} onBack={() => go("")} onSubmit={start} />;
  } else if ((route.name === "week" || route.name === "sample") && learner) {
    page = (
      <PlanPage
        config={config}
        learner={learner}
        status={status}
        steps={steps}
        plan={plan}
        error={error}
        feedback={feedback}
        dirty={feedbackKey(feedback) !== appliedKey}
        newIds={newIds}
        notice={notice}
        onDismissNotice={() => setNotice(undefined)}
        onLike={like}
        onSkip={skip}
        onUndo={undo}
        onReplan={() => void replan()}
        onClearFeedback={clearFeedback}
        onEdit={() => go("build")}
        onHome={() => go("")}
        onRetry={() => void run(learner, false)}
        onCityChange={(slug) => void changeCity(slug)}
      />
    );
  } else {
    page = <Home config={config} onStart={() => go("build")} onPick={(sample) => start(sample.input)} hasSaved={Boolean(plan && learner)} onResume={() => go("week")} />;
  }

  return (
    <div class="shell">
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      {nav}
      {page}
      {footer}
    </div>
  );
}
