import { IconAdjustments, IconChevronDown, IconCircleCheck, IconCircleDashed, IconCircleX } from "@tabler/icons-preact";
import { useState } from "preact/hooks";
import type { TraceStep } from "../../src/agent/types";
import type { QlooCallInfo } from "../../src/qloo/types";
import { sourceLabel } from "../lib/labels";
import { STROKE } from "./visual";

const STATUS: Record<TraceStep["status"], { icon: typeof IconCircleCheck; label: string }> = {
  ok: { icon: IconCircleCheck, label: "Done" },
  adjusted: { icon: IconAdjustments, label: "Adjusted" },
  skipped: { icon: IconCircleDashed, label: "Skipped" },
  failed: { icon: IconCircleX, label: "Failed" },
};

const NAME_PARAMS = new Set(["signal.interests.entities", "filter.exclude.entities", "entity_ids", "filter.results.entities"]);

function describeValue(key: string, value: string, names: Map<string, string>): { shown: string; full: string } {
  if (NAME_PARAMS.has(key)) {
    const ids = value.split(",");
    const shown = ids.map((id) => names.get(id) ?? `${id.slice(0, 8)}…`).join(", ");
    return { shown, full: value };
  }
  if (key === "filter.tags" || key === "signal.interests.tags") {
    const tags = value.split(",").map((t) => t.split(":").slice(-1)[0]!.replace(/_/g, " "));
    return { shown: tags.join(", "), full: value };
  }
  return { shown: value.includes(",") ? value.split(",").join(", ") : value, full: value };
}

function Call({ call, names }: { call: QlooCallInfo; names: Map<string, string> }) {
  const entries = Object.entries(call.params);
  return (
    <li class="call">
      <p class="call__head">
        <code>GET {call.path}</code>
        <span class={`badge badge--${call.source}`}>{sourceLabel(call.source, call.recordedAt, call.cached)}</span>
      </p>
      <dl class="call__params">
        {entries.map(([key, value]) => {
          const { shown, full } = describeValue(key, value, names);
          return (
            <>
              <dt>{key}</dt>
              <dd title={full}>{shown}</dd>
            </>
          );
        })}
      </dl>
      <p class="call__foot">
        {call.results} result{call.results === 1 ? "" : "s"}
        {call.source === "live" && !call.cached ? `, ${call.ms} ms` : ""}
      </p>
    </li>
  );
}

export function TraceList({ steps, names, live, compact }: { steps: TraceStep[]; names: Map<string, string>; live?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState<string | undefined>();
  return (
    <ol class={`trace ${compact ? "trace--compact" : ""}`}>
      {steps.map((step) => {
        const status = STATUS[step.status];
        const Icon = status.icon;
        const isOpen = open === step.id;
        return (
          <li class={`trace__step trace__step--${step.status}`} key={step.id}>
            <Icon class="trace__icon" size={18} stroke={STROKE} aria-label={status.label} />
            <div class="trace__main">
              <p class="trace__title">{step.title}</p>
              {step.detail ? <p class="trace__detail">{step.detail}</p> : null}
              {step.calls.length > 0 && !compact ? (
                <button type="button" class="trace__toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : step.id)}>
                  {step.calls.length} Qloo request{step.calls.length === 1 ? "" : "s"}
                  <IconChevronDown size={14} stroke={STROKE} aria-hidden="true" />
                </button>
              ) : null}
              {isOpen ? (
                <ul class="calls">
                  {step.calls.map((call) => (
                    <Call call={call} names={names} />
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
      {live ? (
        <li class="trace__step trace__step--working" aria-live="polite">
          <span class="spinner" aria-hidden="true" />
          <div class="trace__main">
            <p class="trace__title">Working</p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}
