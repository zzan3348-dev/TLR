import {
  useId,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { CountryLeaderPresentation } from "../types/countryPresentation";

type CountryLeaderInfoProps = {
  leader: CountryLeaderPresentation;
  triggerClassName: string;
  triggerLabel: string;
  mode?: "embedded" | "floating";
  children?: ReactNode;
};

function LeaderTooltipContent({
  leader,
}: {
  leader: CountryLeaderPresentation;
}) {
  return (
    <>
      <strong className="hybrid-country-panel__leader-name">
        {leader.name || "[지도자 정보 없음]"}
      </strong>
      {leader.effects.length > 0 ? (
        <ul className="hybrid-country-panel__leader-effects">
          {leader.effects.map((effect) => {
            const lines = effect.lines.filter((line) => line.text.trim());
            if (!effect.name.trim() && lines.length === 0) {
              return null;
            }

            return (
              <li key={effect.id}>
                {effect.name.trim() ? (
                  <span className="hybrid-country-panel__leader-effect-name">
                    {effect.name}
                  </span>
                ) : null}
                {lines.map((line) => (
                  <span
                    key={line.id}
                    className="hybrid-country-panel__leader-effect-line"
                    data-tone={line.tone}
                  >
                    {line.text}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function positionEmbeddedTooltip(
  event: ReactPointerEvent<HTMLButtonElement>,
): void {
  const portraitSlot = event.currentTarget.parentElement;
  if (!portraitSlot) {
    return;
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  portraitSlot.style.setProperty(
    "--leader-tooltip-x",
    `${event.clientX - bounds.left + 14}px`,
  );
  portraitSlot.style.setProperty(
    "--leader-tooltip-y",
    `${event.clientY - bounds.top + 14}px`,
  );
}

export function CountryLeaderInfo({
  leader,
  triggerClassName,
  triggerLabel,
  mode = "floating",
  children,
}: CountryLeaderInfoProps) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  const showFloatingTooltip = (clientX: number, clientY: number) => {
    const width = Math.min(286, window.innerWidth - 24);
    const height = Math.min(330, window.innerHeight - 24);
    setTooltip({
      x: Math.max(12, Math.min(clientX + 14, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(clientY + 14, window.innerHeight - height - 12)),
    });
  };

  if (mode === "embedded") {
    return (
      <>
        <button
          type="button"
          className={triggerClassName}
          aria-label={triggerLabel}
          aria-describedby={tooltipId}
          onPointerEnter={positionEmbeddedTooltip}
          onPointerMove={positionEmbeddedTooltip}
        >
          {children}
        </button>
        <div
          id={tooltipId}
          className="hybrid-country-panel__leader-tooltip"
          role="tooltip"
        >
          <LeaderTooltipContent leader={leader} />
        </div>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-describedby={tooltip ? tooltipId : undefined}
        onPointerEnter={(event) =>
          showFloatingTooltip(event.clientX, event.clientY)
        }
        onPointerMove={(event) =>
          showFloatingTooltip(event.clientX, event.clientY)
        }
        onPointerLeave={() => setTooltip(null)}
        onFocus={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          showFloatingTooltip(bounds.right, bounds.top);
        }}
        onBlur={() => setTooltip(null)}
      >
        {children}
      </button>

      {tooltip
        ? createPortal(
            <aside
              id={tooltipId}
              className="hybrid-country-panel__leader-tooltip country-leader-tooltip--floating"
              style={{ left: tooltip.x, top: tooltip.y }}
              role="tooltip"
            >
              <LeaderTooltipContent leader={leader} />
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
