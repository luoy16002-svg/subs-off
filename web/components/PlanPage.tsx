import { IconArrowLeft, IconArrowRight, IconCloudOff, IconPencil, IconRefresh } from "@tabler/icons-preact";
import { useMemo } from "preact/hooks";
import type { LearnerInput, LikeInput, Pick, Plan, SkipInput, SkipReason, Slot, TraceStep } from "../../src/agent/types";
import type { AppConfig } from "../lib/api";
import { LEVELS, percent, plural, possessive, SLOT_NAME } from "../lib/labels";
import { PickCard } from "./PickCard";
import { TraceList } from "./Trace";
import { SlotIcon, STROKE } from "./visual";

export interface Feedback {
  likes: Record<string, LikeInput>;
  skips: Record<string, SkipInput>;
}

export type PlanStatus = "loading" | "ready" | "error" | "replanning";

export interface PlanPageProps {
  config: AppConfig;
  learner: LearnerInput;
  status: PlanStatus;
  steps: TraceStep[];
  plan?: Plan | undefined;
  error?: { title: string; message: string; retryable: boolean } | undefined;
  feedback: Feedback;
  dirty: boolean;
  newIds: Set<string>;
  notice?: string | undefined;
  onDismissNotice: () => void;
  onLike: (pick: Pick) => void;
  onSkip: (pick: Pick, reason: SkipReason) => void;
  onUndo: (pick: Pick) => void;
  onReplan: () => void;
  onClearFeedback: () => void;
  onEdit: () => void;
  onHome: () => void;
  onRetry: () => void;
}

type Variant = "feature" | "half" | "third";

function layout(picks: Pick[]): Array<{ pick: Pick; variant: Variant }> {
  const by = (slot: Slot) => picks.filter((p) => p.slot === slot);
  const out: Array<{ pick: Pick; variant: Variant }> = [];
  const pair = (a: Pick[], b: Pick[]) => {
    const both = [...a, ...b];
    for (const pick of both) out.push({ pick, variant: both.length >= 2 ? "half" : "feature" });
  };
  for (const pick of by("series")) out.push({ pick, variant: "feature" });
  pair(by("film"), by("book"));
  const music = by("music");
  for (const pick of music) out.push({ pick, variant: music.length >= 3 ? "third" : music.length === 2 ? "half" : "feature" });
  pair(by("podcast"), by("food"));
  return out;
}

function namesFor(plan: Plan | undefined, learner: LearnerInput, feedback: Feedback): Map<string, string> {
  const names = new Map<string, string>();
  for (const f of plan?.favorites ?? []) names.set(f.id, f.name);
  for (const p of plan?.picks ?? []) names.set(p.id, p.name);
  for (const f of learner.favorites) if (f.id) names.set(f.id, f.name);
  for (const l of Object.values(feedback.likes)) if (l.name) names.set(l.id, l.name);
  for (const s of Object.values(feedback.skips)) if (s.name) names.set(s.id, s.name);
  return names;
}

function WeekStrip({ plan }: { plan: Plan }) {
  const byId = new Map(plan.picks.map((p) => [p.id, p]));
  return (
    <section class="week" aria-labelledby="week-title">
      <h2 id="week-title" class="sr-only">
        Day by day
      </h2>
      <ol class="week__days">
        {plan.days.map((day) => {
          const onTheGo = day.doses.some((d) => d.onTheGo);
          return (
            <li class="day">
              <p class="day__name">
                <span class="day__short">{day.short}</span>
                <span class="day__theme">{day.theme}</span>
              </p>
              <ul class="day__doses">
                {day.doses.map((dose) => {
                  const pick = byId.get(dose.pickId);
                  if (!pick) return null;
                  return (
                    <li class={`dose ${dose.main ? "dose--main" : ""}`}>
                      <a href={`#pick-${pick.id}`}>
                        <SlotIcon slot={dose.slot} size={15} />
                        <span class="dose__text">
                          <span class="dose__title">{pick.name}</span>
                          <span class="dose__action">{dose.action}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
              <p class="day__time">
                {day.doses.some((d) => d.slot === "food" && d.main) ? "A meal out" : `${day.minutes} min`}
                {onTheGo ? <span> + on the go</span> : null}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Influence({ plan }: { plan: Plan }) {
  if (plan.influence.length === 0) return null;
  return (
    <div class="side__block">
      <h3>What shaped this week</h3>
      <div class="share-bar share-bar--lg" role="img" aria-label={plan.influence.map((i) => `${i.name} ${percent(i.share)}`).join(", ")}>
        {plan.influence.map((item, i) => (
          <span class={`share-bar__seg share-bar__seg--${i}`} style={{ flexGrow: Math.max(item.share, 0.02) }} />
        ))}
      </div>
      <ul class="share-legend share-legend--stack">
        {plan.influence.map((item, i) => (
          <li>
            <i class={`share-dot share-bar__seg--${i}`} aria-hidden="true" />
            {item.name}
            <b>{percent(item.share)}</b>
          </li>
        ))}
      </ul>
      <p class="side__note">Share of Qloo's explainability scores across all picks.</p>
    </div>
  );
}

function Header({ learner, plan, config, onEdit, onHome }: { learner: LearnerInput; plan?: Plan | undefined; config: AppConfig; onEdit: () => void; onHome: () => void }) {
  const language = config.languages.find((l) => l.code === learner.language);
  const city = language?.cities.find((c) => c.slug === learner.targetCity)?.name ?? learner.targetCity;
  const level = LEVELS.find((l) => l.id === learner.level)?.name ?? learner.level;
  const series = plan?.picks.find((p) => p.slot === "series");
  return (
    <header class="plan__head">
      <button type="button" class="back" onClick={onHome}>
        <IconArrowLeft size={16} stroke={STROKE} aria-hidden="true" /> All learners
      </button>
      <div class="plan__title-row">
        <h1>
          {possessive(learner.name)} week in {language?.name ?? learner.language}
        </h1>
        <button type="button" class="btn btn--ghost btn--sm" onClick={onEdit}>
          <IconPencil size={16} stroke={STROKE} aria-hidden="true" /> Edit
        </button>
      </div>
      {plan ? <p class="plan__intro">{plan.intro}</p> : <p class="plan__intro is-pending">Asking Qloo about {learner.favorites.map((f) => f.name).join(", ")}.</p>}
      <ul class="plan__facts">
        <li>{level}</li>
        <li>Taste of {city}</li>
        <li>{learner.minutesPerDay} min a day</li>
        {learner.homeCity ? <li>Lives in {learner.homeCity}</li> : null}
      </ul>
      {plan && plan.usualList.length > 0 && series ? (
        <p class="plan__usual">
          The usual beginner lists start with {plan.usualList.slice(0, 3).join(", ")}. This week starts with <a href={`#pick-${series.id}`}>{series.name}</a>.
        </p>
      ) : null}
    </header>
  );
}

function Changes({ plan }: { plan: Plan }) {
  if (plan.changes.length === 0) return null;
  return (
    <section class="changes" aria-labelledby="changes-title">
      <h2 id="changes-title">What changed</h2>
      <ul>
        {plan.changes.map((change) => (
          <li>
            <SlotIcon slot={change.slot} size={16} />
            <span class="changes__swap">
              {change.from ? <s>{change.from.name}</s> : null}
              {change.from && change.to ? <IconArrowRight size={14} stroke={STROKE} aria-label="replaced by" /> : null}
              {change.to ? <a href={`#pick-${change.to.id}`}>{change.to.name}</a> : null}
            </span>
            <span class="changes__why">{change.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Working({ learner, steps }: { learner: LearnerInput; steps: TraceStep[] }) {
  return (
    <section class="working" aria-live="polite">
      <div class="working__panel">
        <h2>The agent is asking Qloo</h2>
        <p class="working__lede">Each line is a step that just finished. Open any step later to see the exact request.</p>
        <TraceList steps={steps} names={new Map(learner.favorites.filter((f) => f.id).map((f) => [f.id!, f.name]))} live compact />
      </div>
      <div class="working__ghost" aria-hidden="true">
        <div class="ghost-week">
          {Array.from({ length: 7 }, () => (
            <span />
          ))}
        </div>
        <div class="ghost-card ghost-card--wide" />
        <div class="ghost-row">
          <div class="ghost-card" />
          <div class="ghost-card" />
        </div>
      </div>
    </section>
  );
}

function ErrorPanel({ error, onRetry, onHome }: { error: NonNullable<PlanPageProps["error"]>; onRetry: () => void; onHome: () => void }) {
  return (
    <section class="error-panel" role="alert">
      <IconCloudOff size={28} stroke={STROKE} aria-hidden="true" />
      <h2>{error.title}</h2>
      <p>{error.message}</p>
      <div class="error-panel__actions">
        {error.retryable ? (
          <button type="button" class="btn btn--sub" onClick={onRetry}>
            <IconRefresh size={16} stroke={STROKE} aria-hidden="true" /> Try again
          </button>
        ) : null}
        <button type="button" class="btn btn--ghost" onClick={onHome}>
          Pick a sample learner
        </button>
      </div>
    </section>
  );
}

function ReplanBar({ feedback, busy, onReplan, onClear }: { feedback: Feedback; busy: boolean; onReplan: () => void; onClear: () => void }) {
  const likes = Object.keys(feedback.likes).length;
  const skips = Object.keys(feedback.skips).length;
  const parts = [likes ? plural(likes, "like") : "", skips ? plural(skips, "skip") : ""].filter(Boolean);
  return (
    <div class="replan" role="region" aria-label="Re-plan">
      <p>{parts.join(", ")}. The agent will keep what you liked and replace what you skipped.</p>
      <div class="replan__actions">
        <button type="button" class="btn btn--quiet" onClick={onClear} disabled={busy}>
          Clear
        </button>
        <button type="button" class="btn btn--sub" onClick={onReplan} disabled={busy}>
          <IconRefresh size={16} stroke={STROKE} aria-hidden="true" class={busy ? "spin" : ""} /> {busy ? "Re-planning" : "Re-plan my week"}
        </button>
      </div>
    </div>
  );
}

export function PlanPage(props: PlanPageProps) {
  const { plan, learner, feedback, config } = props;
  const names = useMemo(() => namesFor(plan, learner, feedback), [plan, learner, feedback]);
  const cards = useMemo(() => (plan ? layout(plan.picks) : []), [plan]);
  const missing = plan?.notes.filter((n) => n.kind !== "info") ?? [];
  const infoNotes = plan?.notes.filter((n) => n.kind === "info") ?? [];
  const busy = props.status === "replanning";
  const lastStep = props.steps[props.steps.length - 1];

  return (
    <main id="main" class={`plan ${busy ? "is-busy" : ""}`}>
      <Header learner={learner} plan={plan} config={config} onEdit={props.onEdit} onHome={props.onHome} />

      {props.status === "loading" ? <Working learner={learner} steps={props.steps} /> : null}
      {props.status === "error" && props.error ? <ErrorPanel error={props.error} onRetry={props.onRetry} onHome={props.onHome} /> : null}

      {plan && props.status !== "loading" && props.status !== "error" ? (
        <>
          {busy ? (
            <p class="busy-line" aria-live="polite">
              <span class="spinner" aria-hidden="true" /> Re-planning. {lastStep ? `${lastStep.title}.` : "Asking Qloo."}
            </p>
          ) : null}
          {props.notice ? (
            <p class="notice" role="status">
              {props.notice}
              <button type="button" class="btn btn--quiet" onClick={props.onDismissNotice}>
                Dismiss
              </button>
            </p>
          ) : null}
          <Changes plan={plan} />
          <WeekStrip plan={plan} />
          <div class="plan__cols">
            <section class="picks" aria-labelledby="picks-title">
              <h2 id="picks-title">This week's picks</h2>
              <div class="picks__grid">
                {cards.map(({ pick, variant }) => (
                  <PickCard
                    key={pick.id}
                    pick={pick}
                    language={plan.learner.language}
                    variant={variant}
                    feedback={{ liked: Boolean(feedback.likes[pick.id]), skipped: feedback.skips[pick.id]?.reason }}
                    isNew={props.newIds.has(pick.id)}
                    onLike={props.onLike}
                    onSkip={props.onSkip}
                    onUndo={props.onUndo}
                  />
                ))}
              </div>
              {missing.length > 0 ? (
                <ul class="notes">
                  {missing.map((note) => (
                    <li>{note.text}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <aside class="side" aria-label="How this week was built">
              <div class="side__block">
                <h3>Your taste, as Qloo reads it</h3>
                <p class="tags">{plan.taste.tags.slice(0, 8).map((tag) => <span class="tag">{tag.name}</span>)}</p>
                <p class="side__note">{plan.taste.source === "qloo" ? "From Qloo's taste analysis of your favorites." : "From your favorites' own Qloo tags."}</p>
              </div>
              <Influence plan={plan} />
              <div class="side__block">
                <h3>How this week was built</h3>
                <TraceList steps={plan.trace} names={names} />
                <p class="side__note">
                  {plan.mode === "live" ? "Live Qloo API" : "Offline sample data shaped like the Qloo API"}. Notes by {plan.writer === "workers-ai" ? "Llama on Workers AI" : "templates"}.
                </p>
                {infoNotes.map((note) => (
                  <p class="side__note">{note.text}</p>
                ))}
              </div>
            </aside>
          </div>
          {props.dirty ? <ReplanBar feedback={feedback} busy={busy} onReplan={props.onReplan} onClear={props.onClearFeedback} /> : null}
        </>
      ) : null}
    </main>
  );
}

export { SLOT_NAME };
