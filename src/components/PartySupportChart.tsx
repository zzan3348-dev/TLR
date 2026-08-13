import {
  useId,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { CountryPartyPresentation } from "../types/countryPresentation";
import { getPartyDisplayColor } from "../utils/partyColors";

type PartySlice = {
  party: CountryPartyPresentation;
  color: string;
  path: string;
  normalizedSupport: number;
};

type PartyTooltipState = {
  party: CountryPartyPresentation;
  color: string;
  x: number;
  y: number;
};

function polarPoint(angle: number, radius = 47): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [
    50 + radius * Math.cos(radians),
    50 + radius * Math.sin(radians),
  ];
}

function buildSlicePath(startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 359.999) {
    return "M 50 3 A 47 47 0 1 1 49.99 3 Z";
  }
  const [startX, startY] = polarPoint(startAngle);
  const [endX, endY] = polarPoint(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    "M 50 50",
    `L ${startX.toFixed(3)} ${startY.toFixed(3)}`,
    `A 47 47 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function buildPartySlices(
  parties: readonly CountryPartyPresentation[],
): readonly PartySlice[] {
  const visible = parties.filter((party) => party.support > 0);
  const total = visible.reduce((sum, party) => sum + party.support, 0);
  if (total <= 0) {
    return [];
  }

  let cursor = 0;
  return visible.map((party, index) => {
    const normalizedSupport = (party.support / total) * 100;
    const start = cursor * 3.6;
    cursor += normalizedSupport;
    return {
      party,
      color: getPartyDisplayColor(party, index),
      path: buildSlicePath(start, cursor * 3.6),
      normalizedSupport,
    };
  });
}

function getTooltipPosition(
  event: MouseEvent<SVGPathElement>,
): Pick<PartyTooltipState, "x" | "y"> {
  const width = 224;
  const height = 142;
  return {
    x: Math.max(
      12,
      Math.min(event.clientX + 16, window.innerWidth - width - 12),
    ),
    y: Math.max(
      12,
      Math.min(event.clientY + 16, window.innerHeight - height - 12),
    ),
  };
}

type PartySupportChartProps = {
  parties: readonly CountryPartyPresentation[];
  className?: string;
};

export function PartySupportChart({
  parties,
  className,
}: PartySupportChartProps) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<PartyTooltipState | null>(null);
  const slices = buildPartySlices(parties);

  return (
    <>
      <figure
        className={`${className ?? ""} party-support-chart`}
        aria-label={
          slices.length > 0
            ? slices
                .map(
                  ({ party }) =>
                    `${party.name} ${party.support.toFixed(1)}%`,
                )
                .join(", ")
            : "정당 지지도 자료 없음"
        }
      >
        <svg viewBox="0 0 100 100" role="img">
          <circle className="party-support-chart__empty" cx="50" cy="50" r="47" />
          {slices.map((slice) => (
            <path
              key={slice.party.id}
              d={slice.path}
              fill={slice.color}
              tabIndex={0}
              aria-describedby={tooltipId}
              aria-label={`${slice.party.name} ${slice.party.support.toFixed(1)}%`}
              onMouseEnter={(event) => {
                setTooltip({
                  party: slice.party,
                  color: slice.color,
                  ...getTooltipPosition(event),
                });
              }}
              onMouseMove={(event) => {
                setTooltip((current) =>
                  current
                    ? {
                        ...current,
                        party: slice.party,
                        color: slice.color,
                        ...getTooltipPosition(event),
                      }
                    : {
                        party: slice.party,
                        color: slice.color,
                        ...getTooltipPosition(event),
                      },
                );
              }}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setTooltip({
                  party: slice.party,
                  color: slice.color,
                  x: Math.min(bounds.right + 12, window.innerWidth - 236),
                  y: Math.max(12, bounds.top),
                });
              }}
              onBlur={() => setTooltip(null)}
            />
          ))}
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
                  "--tooltip-party-color": tooltip.color,
                } as CSSProperties
              }
              role="tooltip"
            >
              <strong>{tooltip.party.name}</strong>
              <span>
                대분류: {tooltip.party.ideologyCategory}
              </span>
              <span>
                하위사상: {tooltip.party.subIdeology}
              </span>
              <b>지지도 {tooltip.party.support.toFixed(1)}%</b>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
