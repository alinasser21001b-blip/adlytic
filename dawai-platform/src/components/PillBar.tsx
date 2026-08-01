import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * The Pill Bar — a single persistent bar that morphs to the highest-priority
 * context. Blueprint rules, all enforced here rather than by convention:
 *
 *  - Priority ladder: SEV_ALERT > ACTION_REQUIRED > IN_PROGRESS > SUGGESTION > IDLE
 *  - Only one state is ever shown. It never stacks into a notification list.
 *  - Higher priority preempts lower immediately.
 *  - 380ms morph between states; a cross-fade when reduced motion is requested.
 *  - SEV_ALERT cannot be auto-dismissed or swiped away. It clears only when its
 *    cause is resolved server-side.
 */

export type AttentionPriority =
  | "SEV_ALERT"
  | "ACTION_REQUIRED"
  | "IN_PROGRESS"
  | "SUGGESTION";

export interface AttentionEvent {
  id: string;
  priority: AttentionPriority;
  kind: string;
  title: string;
  body?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
}

const PRIORITY_RANK: Record<AttentionPriority, number> = {
  SEV_ALERT: 4,
  ACTION_REQUIRED: 3,
  IN_PROGRESS: 2,
  SUGGESTION: 1,
};

const PRIORITY_ICON: Record<AttentionPriority, Parameters<typeof Icon>[0]["name"]> = {
  SEV_ALERT: "shield",
  ACTION_REQUIRED: "prescription",
  IN_PROGRESS: "clock",
  SUGGESTION: "spark",
};

/** Pure selector: the one event the bar shows, or null for IDLE. */
export function selectPillBarEvent(
  events: readonly AttentionEvent[],
): AttentionEvent | null {
  let winner: AttentionEvent | null = null;
  for (const event of events) {
    if (!winner || PRIORITY_RANK[event.priority] > PRIORITY_RANK[winner.priority]) {
      winner = event;
    }
  }
  return winner;
}

export function PillBar({
  events,
  onAction,
  onDismiss,
}: {
  events: readonly AttentionEvent[];
  onAction?: (event: AttentionEvent) => void;
  onDismiss?: (event: AttentionEvent) => void;
}) {
  const active = useMemo(() => selectPillBarEvent(events), [events]);
  const [morphing, setMorphing] = useState(false);
  const previousId = useRef<string | null>(null);

  // Morph only when the shown event actually changes identity — re-renders with
  // the same event must not restart the animation.
  useEffect(() => {
    if (!active) {
      previousId.current = null;
      return;
    }
    if (previousId.current === active.id) return;
    previousId.current = active.id;
    setMorphing(true);
    const timer = window.setTimeout(() => setMorphing(false), 380);
    return () => window.clearTimeout(timer);
  }, [active?.id]);

  if (!active) return null;

  const severe = active.priority === "SEV_ALERT";

  return (
    <div
      className={`pill-bar pill-${active.priority.toLowerCase().replace("_", "-")} ${
        morphing ? "morphing" : ""
      }`}
      // A severe safety alert interrupts; everything else informs politely.
      role={severe ? "alert" : "status"}
      aria-live={severe ? "assertive" : "polite"}
    >
      <span className="pill-icon" aria-hidden="true">
        <Icon name={PRIORITY_ICON[active.priority]} size={20} />
      </span>
      <div className="pill-copy">
        <strong>{active.title}</strong>
        {active.body ? <span>{active.body}</span> : null}
      </div>
      {onAction ? (
        <button type="button" className="pill-action" onClick={() => onAction(active)}>
          {severe ? "مراجعة" : active.priority === "ACTION_REQUIRED" ? "تأكيد" : "عرض"}
        </button>
      ) : null}
      {/* No dismiss affordance at all on SEV_ALERT — not a disabled one. */}
      {!severe && onDismiss ? (
        <button
          type="button"
          className="pill-dismiss"
          aria-label="إخفاء التنبيه"
          onClick={() => onDismiss(active)}
        >
          <Icon name="check" size={16} />
        </button>
      ) : null}
    </div>
  );
}
