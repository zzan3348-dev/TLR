import { useId, useRef, useState } from "react";
import { useOptionalEventEffectExecutor } from "../../effects/useEventEffectExecutor";
import type { EventChoice } from "../types";
import { EventChoiceTooltip } from "./EventChoiceTooltip";

type EventChoiceButtonProps = {
  eventId: string;
  eventInstanceId: string;
  choice: EventChoice;
  selected: boolean;
  onApplied: () => void;
  variant?: "paper" | "super";
  previewOnly?: boolean;
};

export function EventChoiceButton({
  eventId,
  eventInstanceId,
  choice,
  selected,
  onApplied,
  variant = "paper",
  previewOnly = false,
}: EventChoiceButtonProps) {
  const executor = useOptionalEventEffectExecutor();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showTooltip = () => {
    if (buttonRef.current) setAnchor(buttonRef.current.getBoundingClientRect());
  };
  const choose = async () => {
    if (pending || selected) return;
    if (previewOnly) {
      onApplied();
      return;
    }
    if (!executor) throw new Error("EVENT_EFFECT_EXECUTOR_UNAVAILABLE");
    setPending(true);
    setError(null);
    try {
      await executor.execute({
        eventId,
        eventInstanceId,
        choiceId: choice.id,
        effects: choice.effects ?? [],
      });
      onApplied();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "UNKNOWN_EVENT_EFFECT_ERROR");
      showTooltip();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        className={variant === "super" ? "super-event-template__finish" : "event-choice-button"}
        data-selected={selected}
        data-pending={pending}
        type="button"
        disabled={pending || selected}
        aria-describedby={anchor ? tooltipId : undefined}
        onClick={() => void choose()}
        onPointerEnter={showTooltip}
        onPointerLeave={() => setAnchor(null)}
        onFocus={showTooltip}
        onBlur={() => setAnchor(null)}
      >
        {variant === "paper" ? <span className="event-choice-button__accent" aria-hidden="true" /> : null}
        <span className={variant === "paper" ? "eventChoiceText" : undefined}>
          {pending ? "처리 중…" : choice.text}
        </span>
      </button>
      {anchor ? <EventChoiceTooltip id={tooltipId} choice={choice} anchor={anchor} error={error} /> : null}
    </>
  );
}
