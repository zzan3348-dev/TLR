import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatEventEffects } from "../../effects/effectFormatter";
import type { EventChoice } from "../types";

type TooltipPosition = { left: number; top: number };

export function EventChoiceTooltip({
  id,
  choice,
  anchor,
  error,
}: {
  id: string;
  choice: EventChoice;
  anchor: DOMRect;
  error?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TooltipPosition>(() => ({
    left: Math.max(8, Math.min(window.innerWidth - 368, anchor.left + anchor.width / 2 - 180)),
    top: Math.max(8, anchor.top - 12),
  }));
  const lines = formatEventEffects(choice.effects ?? []);
  const showCountry = new Set(lines.map(({ countryId }) => countryId)).size > 1;

  useLayoutEffect(() => {
    const tooltip = ref.current;
    if (!tooltip) return;
    const bounds = tooltip.getBoundingClientRect();
    const preferredTop = anchor.top - bounds.height - 10;
    const top = preferredTop >= 8
      ? preferredTop
      : Math.min(window.innerHeight - bounds.height - 8, anchor.bottom + 10);
    const left = Math.max(8, Math.min(window.innerWidth - bounds.width - 8, anchor.left + anchor.width / 2 - bounds.width / 2));
    setPosition({ left, top: Math.max(8, top) });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      className="event-choice-tooltip"
      role="tooltip"
      style={position}
    >
      <strong>{choice.text}</strong>
      {choice.description ? <p>{choice.description}</p> : null}
      {lines.length || error ? <div className="event-choice-tooltip__rule" /> : null}
      {lines.length ? (
        <section>
          <h4>효과</h4>
          <ul>
            {lines.map((line) => (
              <li key={line.id} data-tone={line.tone}>
                {showCountry ? <b>{line.countryName}</b> : null}
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {error ? <p className="event-choice-tooltip__error">효과 적용 실패: {error}</p> : null}
    </div>,
    document.body,
  );
}
