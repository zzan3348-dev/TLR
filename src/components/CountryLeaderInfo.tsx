import {
  useId,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { CountryLeaderPresentation } from "../types/countryPresentation";

type CountryLeaderInfoProps = {
  leader: CountryLeaderPresentation;
  triggerClassName: string;
  triggerLabel: string;
  children?: ReactNode;
};

export function CountryLeaderInfo({
  leader,
  triggerClassName,
  triggerLabel,
  children,
}: CountryLeaderInfoProps) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  const showTooltip = (clientX: number, clientY: number) => {
    const width = Math.min(286, window.innerWidth - 24);
    const height = Math.min(330, window.innerHeight - 24);
    setTooltip({
      x: Math.max(12, Math.min(clientX + 14, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(clientY + 14, window.innerHeight - height - 12)),
    });
  };

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-describedby={tooltip ? tooltipId : undefined}
        onPointerEnter={(event) => showTooltip(event.clientX, event.clientY)}
        onPointerMove={(event) => showTooltip(event.clientX, event.clientY)}
        onPointerLeave={() => setTooltip(null)}
        onFocus={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          showTooltip(bounds.right, bounds.top);
        }}
        onBlur={() => setTooltip(null)}
      >
        {children}
      </button>

      {tooltip
        ? createPortal(
            <aside
              id={tooltipId}
              className="country-leader-tooltip"
              style={{ left: tooltip.x, top: tooltip.y }}
              role="tooltip"
            >
              <strong className="hybrid-country-panel__leader-name">
                {leader.name || "지도자 미설정"}
              </strong>
              {leader.title ? (
                <span className="country-leader-tooltip__title">
                  {leader.title}
                </span>
              ) : null}
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
                          <strong className="hybrid-country-panel__leader-effect-name">
                            {effect.name}
                          </strong>
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
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
