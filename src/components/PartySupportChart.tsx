import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { CountryPartyPresentation } from "../types/countryPresentation";
import { getPartyDisplayColor } from "../utils/partyColors";

type PartyDisplayItem = {
  party: CountryPartyPresentation;
  color: string;
  normalizedSupport: number;
  isRuling: boolean;
};

type PartyTooltipState = {
  item: PartyDisplayItem;
  x: number;
  y: number;
};

type PartySupportChartProps = {
  parties: readonly CountryPartyPresentation[];
  className?: string;
  rulingPartyName?: string;
};

function getTooltipPosition(
  event: MouseEvent<HTMLElement>,
): Pick<PartyTooltipState, "x" | "y"> {
  const width = 224;
  const height = 104;
  return {
    x: Math.max(12, Math.min(event.clientX + 16, window.innerWidth - width - 12)),
    y: Math.max(12, Math.min(event.clientY + 16, window.innerHeight - height - 12)),
  };
}

export function PartySupportChart({
  parties,
  className,
  rulingPartyName,
}: PartySupportChartProps) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<PartyTooltipState | null>(null);
  const [focusedPartyId, setFocusedPartyId] = useState<string | null>(null);
  const items = useMemo<readonly PartyDisplayItem[]>(() => {
    const visible = parties.filter((party) => party.support > 0);
    const total = visible.reduce((sum, party) => sum + party.support, 0);
    const ruling =
      visible.find((party) => party.name === rulingPartyName) ?? visible[0] ?? null;

    return visible
      .map((party, index) => ({
        party,
        color: getPartyDisplayColor(party, index),
        normalizedSupport: total > 0 ? (party.support / total) * 100 : 0,
        isRuling: party.id === ruling?.id,
      }))
      .sort((left, right) => {
        if (left.isRuling !== right.isRuling) return left.isRuling ? -1 : 1;
        return right.party.support - left.party.support;
      });
  }, [parties, rulingPartyName]);
  const ruling = items.find((item) => item.isRuling) ?? items[0] ?? null;
  const leading = items.reduce<PartyDisplayItem | null>(
    (best, candidate) =>
      !best || candidate.party.support > best.party.support ? candidate : best,
    null,
  );

  const showTooltip = (
    event: MouseEvent<HTMLElement>,
    item: PartyDisplayItem,
  ) => {
    setTooltip({ item, ...getTooltipPosition(event) });
  };

  if (!ruling) {
    return (
      <section className={`${className ?? ""} party-support-chart party-support-chart--empty`}>
        <strong>정당 미설정</strong>
      </section>
    );
  }

  return (
    <>
      <section
        className={`${className ?? ""} party-support-chart`}
        aria-label="정당 지지도"
      >
        <article
          className="party-support-chart__ruling"
          style={{ "--party-color": ruling.color } as CSSProperties}
        >
          {ruling.party.symbolPath ? (
            <img src={ruling.party.symbolPath} alt="" draggable={false} />
          ) : (
            <span className="party-support-chart__emblem" aria-hidden="true">
              {ruling.party.name.slice(0, 1)}
            </span>
          )}
          <div>
            <small>집권 정당</small>
            <strong>{ruling.party.name}</strong>
            <span>{ruling.party.subIdeology || "미설정"}</span>
          </div>
          <b>지지도 {ruling.party.support.toFixed(1)}%</b>
        </article>

        <div className="party-support-chart__stack" aria-label="정당별 지지도 분포">
          {items.map((item) => (
            <button
              key={item.party.id}
              type="button"
              className="party-support-chart__segment"
              style={
                {
                  width: `${item.normalizedSupport}%`,
                  "--party-color": item.color,
                } as CSSProperties
              }
              aria-describedby={tooltipId}
              aria-label={`${item.party.name}, ${item.party.subIdeology || "미설정"}, 지지도 ${item.party.support.toFixed(1)}%`}
              data-leading={item === leading}
              onMouseEnter={(event) => showTooltip(event, item)}
              onMouseMove={(event) => showTooltip(event, item)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setTooltip({
                  item,
                  x: Math.min(bounds.left, window.innerWidth - 236),
                  y: Math.max(12, bounds.bottom + 8),
                });
              }}
              onBlur={() => setTooltip(null)}
            />
          ))}
        </div>

        <div className="party-support-chart__list">
          {items.map((item) => (
            <button
              key={item.party.id}
              type="button"
              className="party-support-chart__row"
              data-ruling={item.isRuling}
              data-active={focusedPartyId === item.party.id}
              style={{ "--party-color": item.color } as CSSProperties}
              onClick={() =>
                setFocusedPartyId((current) =>
                  current === item.party.id ? null : item.party.id,
                )
              }
              onMouseEnter={(event) => showTooltip(event, item)}
              onMouseMove={(event) => showTooltip(event, item)}
              onMouseLeave={() => setTooltip(null)}
            >
              <span className="party-support-chart__swatch" aria-hidden="true" />
              <span className="party-support-chart__identity">
                <strong>{item.party.name}</strong>
                <small>{item.party.subIdeology || "미설정"}</small>
              </span>
              {item.isRuling ? <em>집권</em> : null}
              <b>{item.party.support.toFixed(1)}%</b>
            </button>
          ))}
        </div>
      </section>

      {tooltip
        ? createPortal(
            <aside
              id={tooltipId}
              className="party-support-tooltip"
              style={
                {
                  left: tooltip.x,
                  top: tooltip.y,
                  "--tooltip-party-color": tooltip.item.color,
                } as CSSProperties
              }
              role="tooltip"
            >
              <strong>{tooltip.item.party.name}</strong>
              <span>{tooltip.item.party.subIdeology || "미설정"}</span>
              <b>지지도 {tooltip.item.party.support.toFixed(1)}%</b>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
