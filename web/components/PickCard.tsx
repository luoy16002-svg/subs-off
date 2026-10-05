import { IconChevronDown, IconHeart, IconHeartFilled, IconInfoCircle, IconPlayerSkipForward, IconRotate } from "@tabler/icons-preact";
import { useState } from "preact/hooks";
import type { Pick, SkipReason } from "../../src/agent/types";
import { percent, SLOT_NAME, sourceLabel } from "../lib/labels";
import { Frame, SlotIcon, STROKE, type Caption } from "./visual";

export interface PickFeedback {
  liked: boolean;
  skipped?: SkipReason | undefined;
}

const REASONS: Array<{ id: SkipReason; label: string }> = [
  { id: "seen", label: "Seen it" },
  { id: "not_for_me", label: "Not for me" },
  { id: "too_hard", label: "Too hard" },
];

const REASON_TEXT: Record<SkipReason, string> = {
  seen: "Already seen",
  not_for_me: "Not for you",
  too_hard: "Too hard for now",
};

function metaBits(pick: Pick): string[] {
  const bits: string[] = [];
  if (pick.year) bits.push(String(pick.year));
  if (pick.countries.length > 0) bits.push(pick.countries.slice(0, 2).join(", "));
  if (pick.durationMin && (pick.slot === "series" || pick.slot === "film")) bits.push(pick.slot === "series" ? `${pick.durationMin} min episodes` : `${pick.durationMin} min`);
  if (pick.address) bits.push(pick.address);
  return bits;
}

// The caption is the title as it was released, set where subtitles sit.
function captionFor(pick: Pick, language: string): Caption | undefined {
  return pick.localTitle ? { text: pick.localTitle, lang: language } : undefined;
}

export function PickCard(props: {
  pick: Pick;
  language: string;
  variant: "feature" | "half" | "third";
  feedback: PickFeedback;
  isNew?: boolean;
  onLike: (pick: Pick) => void;
  onSkip: (pick: Pick, reason: SkipReason) => void;
  onUndo: (pick: Pick) => void;
}) {
  const { pick, feedback } = props;
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState(false);
  const evidence = pick.evidence;
  const caption = captionFor(pick, props.language);
  const skipped = feedback.skipped;
  const detailsId = `why-${pick.id}`;

  return (
    <article id={`pick-${pick.id}`} class={`pick pick--${props.variant} ${skipped ? "is-skipped" : ""} ${feedback.liked ? "is-liked" : ""} ${props.isNew ? "is-new" : ""}`}>
      <Frame seed={pick.id} title={pick.name} image={pick.image} caption={caption} slot={pick.slot} variant={props.variant === "feature" ? "lg" : props.variant === "third" ? "sq" : "md"}>
        {props.isNew ? <span class="pick__new">New this round</span> : null}
      </Frame>

      <div class="pick__body">
        <p class="pick__slot">
          <SlotIcon slot={pick.slot} size={16} />
          {SLOT_NAME[pick.slot]}
          {pick.pinned ? <span class="pick__kept">Kept from your likes</span> : null}
        </p>
        <h3 class="pick__title">{pick.name}</h3>
        {pick.localTitle ? (
          <p class="pick__local" lang={props.language}>
            {pick.localTitle}
          </p>
        ) : null}
        {metaBits(pick).length > 0 ? (
          <p class="pick__meta">
            {metaBits(pick).map((bit) => (
              <span>{bit}</span>
            ))}
          </p>
        ) : null}

        <p class="pick__why">{pick.why}</p>

        <p class="pick__how">{pick.how}</p>

        {pick.phrases.length > 0 ? (
          <div class="phrases">
            <p class="phrases__label">{pick.slot === "food" ? "Say it" : pick.slot === "book" ? "Watch for" : "Listen for"}</p>
            <ul>
              {pick.phrases.map((phrase) => (
                <li>
                  <span class="phrases__text" lang={props.language}>
                    {phrase.text}
                  </span>
                  {phrase.roman ? <span class="phrases__roman">{phrase.roman}</span> : null}
                  <span class="phrases__gloss">{phrase.gloss}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button type="button" class="evidence-toggle" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
          <IconInfoCircle size={16} stroke={STROKE} aria-hidden="true" />
          Why Qloo picked it
          <IconChevronDown class="evidence-toggle__chev" size={16} stroke={STROKE} aria-hidden="true" />
        </button>
        {open ? (
          <div class="evidence" id={detailsId}>
            {evidence.contributors.length > 0 ? (
              <div class="evidence__block">
                <p class="evidence__label">Which favorites drove the match</p>
                <div class="share-bar" role="img" aria-label={evidence.contributors.map((c) => `${c.name} ${percent(c.share)}`).join(", ")}>
                  {evidence.contributors.map((c, i) => (
                    <span class={`share-bar__seg share-bar__seg--${i}`} style={{ flexGrow: Math.max(c.share, 0.02) }} />
                  ))}
                </div>
                <ul class="share-legend">
                  {evidence.contributors.map((c, i) => (
                    <li>
                      <i class={`share-dot share-bar__seg--${i}`} aria-hidden="true" />
                      {c.name} <b>{percent(c.share)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {evidence.sharedTags.length > 0 ? (
              <div class="evidence__block">
                <p class="evidence__label">Taste it shares with your favorites</p>
                <p class="tags">{evidence.sharedTags.map((t) => <span class="tag">{t}</span>)}</p>
              </div>
            ) : null}
            <dl class="evidence__facts">
              {evidence.rank > 0 ? (
                <>
                  <dt>Qloo rank</dt>
                  <dd>
                    {evidence.rank} of {evidence.of} for this slot
                  </dd>
                </>
              ) : null}
              {evidence.filters.length > 0 ? (
                <>
                  <dt>Filters</dt>
                  <dd>{evidence.filters.join(". ")}</dd>
                </>
              ) : null}
              {pick.dialectNote ? (
                <>
                  <dt>Accent</dt>
                  <dd>{pick.dialectNote}</dd>
                </>
              ) : null}
              <dt>Source</dt>
              <dd>{sourceLabel(evidence.source, undefined, evidence.cached)}</dd>
            </dl>
          </div>
        ) : null}

        {pick.alternate && !skipped ? <p class="pick__alt">Next in line: {pick.alternate.name}</p> : null}

        <div class="pick__actions">
          {skipped ? (
            <>
              <span class="pick__state">Skipped. {REASON_TEXT[skipped]}.</span>
              <button type="button" class="btn btn--quiet" onClick={() => props.onUndo(pick)}>
                <IconRotate size={16} stroke={STROKE} aria-hidden="true" /> Undo
              </button>
            </>
          ) : asking ? (
            <div class="reasons" role="group" aria-label="Why skip it?">
              {REASONS.map((reason) => (
                <button
                  type="button"
                  class="btn btn--chip"
                  onClick={() => {
                    setAsking(false);
                    props.onSkip(pick, reason.id);
                  }}
                >
                  {reason.label}
                </button>
              ))}
              <button type="button" class="btn btn--quiet" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button type="button" class={`btn btn--chip ${feedback.liked ? "is-on" : ""}`} aria-pressed={feedback.liked} onClick={() => (feedback.liked ? props.onUndo(pick) : props.onLike(pick))}>
                {feedback.liked ? <IconHeartFilled size={16} aria-hidden="true" /> : <IconHeart size={16} stroke={STROKE} aria-hidden="true" />}
                {feedback.liked ? "Liked" : "Like"}
              </button>
              <button type="button" class="btn btn--chip" onClick={() => setAsking(true)}>
                <IconPlayerSkipForward size={16} stroke={STROKE} aria-hidden="true" /> Skip
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
