import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { CountryPartyPresentation } from "../types/countryPresentation";
import { getPartyDisplayColor } from "../utils/partyColors";

type PartySlice = {
  party: CountryPartyPresentation;
  color: string;
  startAngle: number;
  endAngle: number;
  isRuling: boolean;
};

type PartyTooltipState = {
  slice: PartySlice;
  x: number;
  y: number;
};

type PartySupportChartProps = {
  parties: readonly CountryPartyPresentation[];
  className?: string;
  rulingPartyName?: string;
};

function polarPoint(angle: number, radius = 48) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: 50 + radius * Math.cos(radians),
    y: 50 + radius * Math.sin(radians),
  };
}

function buildSlicePath(startAngle: number, endAngle: number) {
  if (endAngle - startAngle >= 359.999) {
    return "M 50 2 A 48 48 0 1 1 49.999 2 Z";
  }

  const start = polarPoint(startAngle);
  const end = polarPoint(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    "M 50 50",
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A 48 48 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function getTooltipPosition(
  event: MouseEvent<SVGPathElement>,
): Pick<PartyTooltipState, "x" | "y"> {
  const width = 224;
  const height = 104;
  return {
    x: Math.max(12, Math.min(event.clientX + 16, window.innerWidth - width - 12)),
    y: Math.max(12, Math.min(event.clientY + 16, window.innerHeight - height - 12)),
  };
}

function getFocusTooltipPosition(
  event: FocusEvent<SVGPathElement>,
): Pick<PartyTooltipState, "x" | "y"> {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(12, Math.min(bounds.right + 10, window.innerWidth - 236)),
    y: Math.max(12, Math.min(bounds.top, window.innerHeight - 116)),
  };
}

export function PartySupportChart({
  parties,
  className,
  rulingPartyName,
}: PartySupportChartProps) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<PartyTooltipState | null>(null);
  const slices = useMemo<readonly PartySlice[]>(() => {
    const visible = parties.filter((party) => party.support > 0);
    const total = visible.reduce((sum, party) => sum + party.support, 0);
    if (total <= 0) return [];

    let cursor = 0;
    return visible.map((party, index) => {
      const startAngle = cursor;
      cursor += (party.support / total) * 360;
      return {
        party,
        color: getPartyDisplayColor(party, index),
        startAngle,
        endAngle: index === visible.length - 1 ? 360 : cursor,
        isRuling: party.name === rulingPartyName,
      };
    });
  }, [parties, rulingPartyName]);

  const showTooltip = (
    event: MouseEvent<SVGPathElement>,
    slice: PartySlice,
  ) => {
    setTooltip({ slice, ...getTooltipPosition(event) });
  };

  return (
    <>
      <figure
        className={`${className ?? ""} party-support-chart`}
        aria-label="정당 지지도 원형 그래프"
      >
        <svg viewBox="0 0 100 100" role="img" aria-label="정당별 지지도">
          {slices.length > 0 ? (
            slices.map((slice) => (
              <path
                key={slice.party.id}
                d={buildSlicePath(slice.startAngle, slice.endAngle)}
                fill={slice.color}
                tabIndex={0}
                data-ruling={slice.isRuling}
                aria-describedby={tooltipId}
                aria-label={`${slice.party.name}, ${slice.party.subIdeology || "미설정"}, 지지도 ${slice.party.support.toFixed(1)}%`}
                onMouseEnter={(event) => showTooltip(event, slice)}
                onMouseMove={(event) => showTooltip(event, slice)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={(event) =>
                  setTooltip({
                    slice,
                    ...getFocusTooltipPosition(event),
                  })
                }
                onBlur={() => setTooltip(null)}
              />
            ))
          ) : (
            <circle cx="50" cy="50" r="48" className="party-support-chart__empty" />
          )}
        </svg>
        <span aria-hidden="true" />
      </figure>

      {tooltip
        ? createPortal(
            <aside
              id={tooltipId}
              className="party-support-tooltip"
              style={
                {
                  left: tooltip.x,
                  top: tooltip.y,
                  "--tooltip-party-color": tooltip.slice.color,
                } as CSSProperties
              }
              role="tooltip"
            >
              <strong>{tooltip.slice.party.name}</strong>
              <span>{tooltip.slice.party.subIdeology || "미설정"}</span>
              <b>지지도 {tooltip.slice.party.support.toFixed(1)}%</b>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
