import {
  IconBook,
  IconDeviceTv,
  IconMicrophone2,
  IconMovie,
  IconMusic,
  IconToolsKitchen2,
} from "@tabler/icons-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Slot } from "../../src/agent/types";

export const STROKE = 1.75;

const SLOT_ICONS: Record<Slot, typeof IconDeviceTv> = {
  series: IconDeviceTv,
  film: IconMovie,
  music: IconMusic,
  book: IconBook,
  podcast: IconMicrophone2,
  food: IconToolsKitchen2,
};

export function SlotIcon({ slot, size = 18 }: { slot: Slot; size?: number }) {
  const Icon = SLOT_ICONS[slot];
  return <Icon size={size} stroke={STROKE} aria-hidden="true" />;
}

/** The mark: a caption box whose second subtitle line is fading out. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg class="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="6" width="28" height="20" rx="5" fill="var(--logo-box)" />
      <rect x="8" y="16.5" width="16" height="3.2" rx="1.6" fill="var(--sub)" />
      <rect x="11" y="21.6" width="10" height="2.2" rx="1.1" fill="var(--sub)" opacity="0.45" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span class="wordmark">
      <Logo />
      <span>Subs Off</span>
    </span>
  );
}

const TONES = ["#1d2a2c", "#2a2130", "#28291f", "#1f2536", "#2d231e", "#202a24"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function toneFor(seed: string) {
  const h = hash(seed);
  return { tone: TONES[h % TONES.length]!, x: 18 + (h % 64), y: 12 + ((h >> 8) % 50) };
}

// Soft out-of-focus light, like a still from a dim scene: one warm and one cool
// light plus a faint fill, placed by quadrant and seeded per pick.
const WARM = ["rgba(255, 196, 108, 0.40)", "rgba(222, 122, 104, 0.32)", "rgba(244, 172, 118, 0.36)"];
const COOL = ["rgba(88, 168, 166, 0.34)", "rgba(140, 152, 228, 0.30)", "rgba(112, 186, 146, 0.28)"];
const FILL = ["rgba(236, 237, 233, 0.13)", "rgba(240, 200, 210, 0.14)"];

function lightsFor(seed: string) {
  const v = (i: number) => hash(`${seed}:${i}`);
  const pct = (n: number, min: number, span: number) => `${min + (n % span)}%`;
  return [
    { left: pct(v(1), -6, 40), top: pct(v(2), -12, 34), width: pct(v(3), 46, 20), height: pct(v(4), 52, 22), background: WARM[v(5) % WARM.length]! },
    { left: pct(v(6), 46, 28), top: pct(v(7), 6, 40), width: pct(v(8), 36, 20), height: pct(v(9), 40, 24), background: COOL[v(10) % COOL.length]! },
    { left: pct(v(11), 12, 46), top: pct(v(12), 50, 26), width: pct(v(13), 24, 16), height: pct(v(14), 26, 16), background: FILL[v(15) % FILL.length]! },
  ];
}

export interface Caption {
  text: string;
  lang?: string;
  gloss?: string;
}

/**
 * A film frame: the pick's Qloo image in grayscale when there is one,
 * otherwise a graded dark plate with the title set in type. The caption
 * sits where subtitles would.
 */
export function Frame(props: { seed: string; title: string; image?: string | undefined; caption?: Caption | undefined; slot?: Slot; variant?: "lg" | "md" | "sm" | "sq"; children?: ComponentChildren }) {
  const { tone, x, y } = toneFor(props.seed);
  const [imageOk, setImageOk] = useState(Boolean(props.image));
  useEffect(() => setImageOk(Boolean(props.image)), [props.image]);
  return (
    <div class={`frame frame--${props.variant ?? "md"}`} style={{ "--tone": tone, "--fx": `${x}%`, "--fy": `${y}%` }}>
      {imageOk && props.image ? (
        <img class="frame__img" src={props.image} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setImageOk(false)} />
      ) : (
        <>
          <div class="frame__light" aria-hidden="true">
            {lightsFor(props.seed).map((style) => (
              <i style={style} />
            ))}
          </div>
          <div class="frame__type" aria-hidden="true">
            {props.slot ? <SlotIcon slot={props.slot} size={props.variant === "lg" ? 22 : 18} /> : null}
            <span>{props.title}</span>
          </div>
        </>
      )}
      <div class="frame__grain" aria-hidden="true" />
      {props.caption ? (
        <div class="frame__caption">
          <span lang={props.caption.lang}>{props.caption.text}</span>
          {props.caption.gloss ? <small>{props.caption.gloss}</small> : null}
        </div>
      ) : null}
      {props.children}
    </div>
  );
}

const SCREEN_LINES: Array<Caption & { label: string }> = [
  { label: "Spanish, Mexico City", lang: "es-MX", text: "No manches, ¿ya viste el final?", gloss: "No way, have you seen the ending?" },
  { label: "Japanese, Tokyo", lang: "ja", text: "ちょっと待って、まだ見てない！", gloss: "Wait, I haven't watched it yet!" },
  { label: "Korean, Seoul", lang: "ko", text: "진짜? 나도 그 노래 좋아해.", gloss: "Really? I love that song too." },
  { label: "French, Paris", lang: "fr", text: "Laisse tomber. On regarde la suite ?", gloss: "Never mind. Shall we keep watching?" },
];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The hero visual: a dark screen whose subtitles change language. */
export function SubtitleScreen() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SCREEN_LINES.length), 3800);
    return () => window.clearInterval(timer);
  }, [paused, reduced]);
  const line = SCREEN_LINES[index]!;
  return (
    <figure class="screen-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div class="screen">
        <div class="screen__light" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div class="frame__grain" aria-hidden="true" />
        <div class="screen__subs" key={index} aria-live="polite">
          <p lang={line.lang}>{line.text}</p>
          <p class="screen__gloss">{line.gloss}</p>
        </div>
        <div class="screen__bar" aria-hidden="true">
          <span key={`${index}-${paused}`} class={paused || reduced ? "is-still" : ""} />
        </div>
      </div>
      <figcaption class="screen-tabs" role="tablist" aria-label="Subtitle language">
        {SCREEN_LINES.map((item, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={i === index}
            class={i === index ? "is-on" : ""}
            onClick={() => {
              setIndex(i);
              setPaused(true);
            }}
          >
            {item.label}
          </button>
        ))}
      </figcaption>
    </figure>
  );
}
