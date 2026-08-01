import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PillBar, selectPillBarEvent, type AttentionEvent } from "./PillBar";

const event = (
  id: string,
  priority: AttentionEvent["priority"],
): AttentionEvent => ({ id, priority, kind: "TEST", title: `عنوان ${id}` });

describe("Pill Bar state machine", () => {
  it("shows nothing when idle", () => {
    expect(selectPillBarEvent([])).toBeNull();
    const { container } = render(<PillBar events={[]} />);
    expect(container.querySelector(".pill-bar")).toBeNull();
  });

  it("selects strictly by priority, not arrival order", () => {
    const chosen = selectPillBarEvent([
      event("a", "SUGGESTION"),
      event("b", "SEV_ALERT"),
      event("c", "ACTION_REQUIRED"),
    ]);
    expect(chosen?.id).toBe("b");
  });

  it("prefers the higher tier across every adjacent pair", () => {
    const ladder: AttentionEvent["priority"][] = [
      "SUGGESTION",
      "IN_PROGRESS",
      "ACTION_REQUIRED",
      "SEV_ALERT",
    ];
    for (let i = 0; i < ladder.length - 1; i += 1) {
      const lower = event("low", ladder[i]);
      const higher = event("high", ladder[i + 1]);
      expect(selectPillBarEvent([lower, higher])?.id).toBe("high");
      expect(selectPillBarEvent([higher, lower])?.id).toBe("high");
    }
  });

  it("never stacks — one bar regardless of how many events are live", () => {
    const { container } = render(
      <PillBar
        events={[
          event("a", "SUGGESTION"),
          event("b", "IN_PROGRESS"),
          event("c", "ACTION_REQUIRED"),
        ]}
      />,
    );
    expect(container.querySelectorAll(".pill-bar")).toHaveLength(1);
  });

  it("gives a severe alert no dismiss affordance at all", () => {
    const onDismiss = vi.fn();
    render(<PillBar events={[event("sev", "SEV_ALERT")]} onDismiss={onDismiss} />);
    expect(screen.queryByLabelText("إخفاء التنبيه")).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("announces a severe alert assertively and lesser states politely", () => {
    const { unmount } = render(<PillBar events={[event("sev", "SEV_ALERT")]} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    unmount();
    render(<PillBar events={[event("sug", "SUGGESTION")]} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("lets a dismissible state be dismissed", () => {
    const onDismiss = vi.fn();
    render(<PillBar events={[event("sug", "SUGGESTION")]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("إخفاء التنبيه"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("preempts a lower-priority state when a severe alert arrives", () => {
    const { rerender, container } = render(
      <PillBar events={[event("sug", "SUGGESTION")]} />,
    );
    expect(container.querySelector(".pill-suggestion")).not.toBeNull();
    rerender(
      <PillBar events={[event("sug", "SUGGESTION"), event("sev", "SEV_ALERT")]} />,
    );
    expect(container.querySelector(".pill-sev-alert")).not.toBeNull();
    expect(container.querySelector(".pill-suggestion")).toBeNull();
  });
});
