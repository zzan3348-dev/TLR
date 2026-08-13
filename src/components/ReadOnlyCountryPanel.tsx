import type {
  CSSProperties,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCountryPresentation } from "../data/countryPresentation";
import type {
  CountryNationalSpirit,
  CountryPartyPresentation,
  CountryPresentationData,
} from "../types/countryPresentation";
import type { MapCountryIndex } from "../types/mapCountry";
import { CountryFlag } from "./CountryFlag";
import { CountryLeaderInfo } from "./CountryLeaderInfo";
import { getPartyDisplayColor } from "../utils/partyColors";
import { PartySupportChart } from "./PartySupportChart";

type ReadOnlyCountryPanelProps = {
  country: MapCountryIndex | null;
  onClose: () => void;
};

type CountryPanelSlotProps = {
  name:
    | "emblem"
    | "portrait"
    | "header-small"
    | "header-main"
    | "description"
    | "right-detail"
    | "middle-info-top"
    | "middle-info-bottom"
    | "bottom-main";
  children?: ReactNode;
  empty?: boolean;
};

function CountryPanelSlot({
  name,
  children,
  empty = false,
}: CountryPanelSlotProps) {
  return (
    <section
      className={`hybrid-country-panel__slot hybrid-country-panel__slot--${name}`}
      data-empty={empty}
    >
      {children}
    </section>
  );
}

function CountryIdentity({
  presentation,
}: {
  presentation: CountryPresentationData;
}) {
  const titleLength = [...presentation.title.replace(/\s+/gu, "")].length;
  const titleSize =
    titleLength >= 14 ? "compact" : titleLength >= 9 ? "small" : "normal";

  return (
    <div
      className="hybrid-country-panel__identity"
      data-title-size={titleSize}
    >
      <h1 title={presentation.title}>{presentation.title}</h1>
      {presentation.secondaryNames.map((name) => (
        <p key={name}>{name}</p>
      ))}
      {presentation.subtitle ? <strong>{presentation.subtitle}</strong> : null}
      {presentation.politics.faction ? (
        <small>{presentation.politics.faction}</small>
      ) : null}
    </div>
  );
}

function NationalSpiritStrip({
  spirits,
}: {
  spirits: readonly CountryNationalSpirit[];
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrollMetrics, setScrollMetrics] = useState({
    left: 0,
    max: 0,
  });
  const [tooltip, setTooltip] = useState<{
    spirit: CountryNationalSpirit;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }

    const syncScrollMetrics = () => {
      setScrollMetrics({
        left: rail.scrollLeft,
        max: Math.max(0, rail.scrollWidth - rail.clientWidth),
      });
    };

    syncScrollMetrics();
    const observer = new ResizeObserver(syncScrollMetrics);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [spirits.length]);

  const showTooltip = (
    spirit: CountryNationalSpirit,
    clientX: number,
    clientY: number,
  ) => {
    const tooltipWidth = Math.min(310, window.innerWidth - 24);
    const estimatedTooltipHeight = 320;
    setTooltip({
      spirit,
      x: Math.max(
        12,
        Math.min(clientX + 14, window.innerWidth - tooltipWidth - 12),
      ),
      y: Math.max(
        12,
        Math.min(
          clientY + 14,
          window.innerHeight - estimatedTooltipHeight - 12,
        ),
      ),
    });
  };

  return (
    <>
      <div
        className="hybrid-country-panel__spirits"
        data-empty={spirits.length === 0}
      >
        <header>
          <h2>국민정신</h2>
        </header>
        <div
          className="hybrid-country-panel__spirit-rail-shell"
          data-scrollable={scrollMetrics.max > 0}
        >
          <div
            ref={railRef}
            className="hybrid-country-panel__spirit-rail"
            onScroll={(event) => {
              const rail = event.currentTarget;
              setScrollMetrics({
                left: rail.scrollLeft,
                max: Math.max(
                  0,
                  rail.scrollWidth - rail.clientWidth,
                ),
              });
            }}
          >
            {spirits.slice(0, 9).map((spirit) => (
              <article key={spirit.id}>
                <button
                  type="button"
                  aria-label={spirit.name}
                  aria-describedby="national-spirit-tooltip"
                  onPointerEnter={(event) =>
                    showTooltip(spirit, event.clientX, event.clientY)
                  }
                  onPointerMove={(event) =>
                    showTooltip(spirit, event.clientX, event.clientY)
                  }
                  onPointerLeave={() => setTooltip(null)}
                  onFocus={(event) => {
                    const bounds =
                      event.currentTarget.getBoundingClientRect();
                    showTooltip(spirit, bounds.right, bounds.top);
                  }}
                  onBlur={() => setTooltip(null)}
                >
                  {spirit.imagePath ? (
                    <img
                      src={spirit.imagePath}
                      alt=""
                      draggable={false}
                    />
                  ) : null}
                </button>
              </article>
            ))}
          </div>

          {scrollMetrics.max > 0 ? (
            <div className="hybrid-country-panel__spirit-scrollbar">
              <button
                type="button"
                aria-label="국민정신 목록 왼쪽으로 이동"
                onClick={() =>
                  railRef.current?.scrollBy({
                    left: -54,
                    behavior: "smooth",
                  })
                }
              >
                ‹
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, scrollMetrics.max)}
                value={Math.min(
                  scrollMetrics.left,
                  scrollMetrics.max,
                )}
                aria-label="국민정신 목록 위치"
                onChange={(event) => {
                  if (railRef.current) {
                    railRef.current.scrollLeft = Number(
                      event.currentTarget.value,
                    );
                  }
                }}
              />
              <button
                type="button"
                aria-label="국민정신 목록 오른쪽으로 이동"
                onClick={() =>
                  railRef.current?.scrollBy({
                    left: 54,
                    behavior: "smooth",
                  })
                }
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {tooltip
        ? createPortal(
            <aside
              id="national-spirit-tooltip"
              className="national-spirit-tooltip"
              style={{ left: tooltip.x, top: tooltip.y }}
              role="tooltip"
            >
              <h3>{tooltip.spirit.name}</h3>
              <p>{tooltip.spirit.description}</p>
              <ul>
                {tooltip.spirit.effects.map((effect) => (
                  <li
                    key={`${effect.tone}:${effect.text}`}
                    data-tone={effect.tone}
                  >
                    {effect.text}
                  </li>
                ))}
              </ul>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}

const EXAMPLE_PARTIES: readonly CountryPartyPresentation[] = [
  {
    id: "example-party-1",
    name: "예시 정당 1",
    ideologyCategory: "자유주의",
    subIdeology: "고전적 자유주의",
    support: 46,
    color: "#87234c",
    symbolPath: null,
  },
  {
    id: "example-party-2",
    name: "예시 정당 2",
    ideologyCategory: "보수주의",
    subIdeology: "전통보수주의",
    support: 32,
    color: "#394c8f",
    symbolPath: null,
  },
  {
    id: "example-party-3",
    name: "예시 정당 3",
    ideologyCategory: "사회민주주의",
    subIdeology: "정통 사회민주주의",
    support: 22,
    color: "#79501e",
    symbolPath: null,
  },
];

function MajorPartyPanel({
  presentation,
}: {
  presentation: CountryPresentationData;
}) {
  const usesExampleParties = presentation.politics.parties.length === 0;
  const parties = usesExampleParties
    ? EXAMPLE_PARTIES
    : presentation.politics.parties;
  const primaryParty =
    parties.find(
      (party) => party.name === presentation.politics.rulingParty,
    ) ??
    parties[0] ??
    null;
  const primaryName =
    primaryParty?.name ||
    presentation.politics.rulingParty ||
    "정당 정보 없음";
  const primaryIdeology =
    primaryParty?.subIdeology ||
    presentation.politics.subIdeology ||
    "사상 미설정";
  const primarySymbol =
    primaryParty?.symbolPath ?? presentation.politics.symbolPath;
  const chartStyle = {
    "--primary-party-color":
      primaryParty
        ? getPartyDisplayColor(primaryParty, 0)
        : "#4b6163",
  } as CSSProperties;

  return (
    <div
      className="hybrid-country-panel__party-panel"
      data-example={usesExampleParties}
      style={chartStyle}
    >
      <header className="hybrid-country-panel__primary-party">
        {primarySymbol ? (
          <img src={primarySymbol} alt="" draggable={false} />
        ) : (
          <span className="hybrid-country-panel__party-sigil" aria-hidden="true">
            <b>{primaryName.slice(0, 1)}</b>
          </span>
        )}
        <div>
          <strong>{primaryName}</strong>
          <span>{primaryIdeology}</span>
        </div>
      </header>
      <section className="hybrid-country-panel__party-support">
        <div className="hybrid-country-panel__support-visual">
          <PartySupportChart
            parties={parties}
            className="hybrid-country-panel__party-chart"
            rulingPartyName={primaryName}
          />
        </div>
      </section>
    </div>
  );
}

function CountryFacts({
  presentation,
}: {
  presentation: CountryPresentationData;
}) {
  const rows = [
    ["지도자", presentation.leader.name],
    ["직함", presentation.leader.title],
    ["수도", presentation.capital],
    ["국가 상태", presentation.status],
    ...presentation.details.map(({ label, value }) => [label, value]),
  ].filter((row): row is [string, string] => Boolean(row[1]));

  if (rows.length === 0) {
    return null;
  }

  return (
    <dl className="hybrid-country-panel__facts">
      {rows.map(([label, value]) => (
        <div key={`${label}:${value}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CountryArchive({
  presentation,
}: {
  presentation: CountryPresentationData;
}) {
  const hasDescription = Boolean(presentation.description);
  const hasGallery = presentation.gallery.length > 0;

  if (!hasDescription && !hasGallery) {
    return null;
  }

  return (
    <div className="hybrid-country-panel__archive">
      {hasDescription ? (
        <div className="hybrid-country-panel__long-copy">
          {presentation.description.split(/\n{2,}/u).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {hasGallery ? (
        <div className="hybrid-country-panel__gallery">
          {presentation.gallery.slice(0, 3).map((item) => (
            <figure key={`${item.imagePath}:${item.caption}`}>
              <img src={item.imagePath} alt="" draggable={false} />
              {item.caption ? <figcaption>{item.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReadOnlyCountryPanel({
  country,
  onClose,
}: ReadOnlyCountryPanelProps) {
  const presentation = country ? getCountryPresentation(country) : null;
  const panelStyle = country
    ? ({ "--country-accent": country.color } as CSSProperties)
    : undefined;
  return (
    <aside
      className="country-panel country-panel--hybrid"
      data-open={presentation !== null}
      aria-hidden={presentation === null}
      aria-label="선택 국가 정보"
      style={panelStyle}
    >
      {presentation ? (
        <div
          className="hybrid-country-panel"
          key={presentation.country.key}
        >
          <img
            className="hybrid-country-panel__frame"
            src="/assets/ui/country-panel-frame-v2.png"
            alt=""
            draggable={false}
            aria-hidden="true"
          />

          <span
            className="hybrid-country-panel__flag-screen-backing"
            aria-hidden="true"
          />
          <CountryFlag
            country={presentation.country}
            flagPath={presentation.flagPath}
            className="hybrid-country-panel__flag-underlay"
          />

          {presentation.leader.portraitPath ? (
            <img
              className="hybrid-country-panel__portrait-underlay"
              src={presentation.leader.portraitPath}
              alt=""
              draggable={false}
            />
          ) : null}

          <img
            className="hybrid-country-panel__frame-overlay"
            src="/assets/ui/country-panel-frame-overlay-v2.png"
            alt=""
            draggable={false}
            aria-hidden="true"
          />

          <img
            className="hybrid-country-panel__flag-tv-frame"
            src="/assets/ui/flag-tv-frame-v2.png"
            alt=""
            draggable={false}
            aria-hidden="true"
          />

          <div className="hybrid-country-panel__content">
            <CountryPanelSlot
              name="emblem"
              empty={false}
            />

            <CountryPanelSlot
              name="header-small"
              empty={
                !presentation.politics.symbolPath &&
                !presentation.politics.subIdeology
              }
            >
              {presentation.politics.symbolPath ? (
                <img
                  className="hybrid-country-panel__ideology-symbol"
                  src={presentation.politics.symbolPath}
                  alt=""
                  draggable={false}
                />
              ) : presentation.politics.subIdeology ? (
                <span className="hybrid-country-panel__ideology-name">
                  {presentation.politics.subIdeology}
                </span>
              ) : null}
            </CountryPanelSlot>

            <CountryPanelSlot name="header-main">
              <CountryIdentity presentation={presentation} />
            </CountryPanelSlot>

            <CountryPanelSlot name="description">
              <NationalSpiritStrip spirits={presentation.nationalSpirits} />
            </CountryPanelSlot>

            {presentation.leader.portraitPath ? (
              <CountryPanelSlot name="portrait">
                <CountryLeaderInfo
                  leader={presentation.leader}
                  triggerClassName="hybrid-country-panel__portrait-trigger"
                  triggerLabel="지도자 설명 보기"
                  mode="embedded"
                />
              </CountryPanelSlot>
            ) : null}

            <CountryPanelSlot name="right-detail">
              <MajorPartyPanel presentation={presentation} />
            </CountryPanelSlot>

            <CountryPanelSlot
              name="middle-info-top"
              empty={
                !presentation.leader.name &&
                !presentation.leader.title &&
                !presentation.capital &&
                !presentation.status &&
                presentation.details.length === 0
              }
            >
              <CountryFacts presentation={presentation} />
            </CountryPanelSlot>

            <CountryPanelSlot
              name="middle-info-bottom"
              empty={!presentation.motto}
            >
              {presentation.motto ? (
                <blockquote>{presentation.motto}</blockquote>
              ) : null}
            </CountryPanelSlot>

            <CountryPanelSlot
              name="bottom-main"
              empty={false}
            >
              <div className="hybrid-country-panel__bottom-content">
                <CountryArchive presentation={presentation} />
              </div>
            </CountryPanelSlot>
          </div>

          <button
            type="button"
            className="hybrid-country-panel__close"
            onClick={onClose}
            aria-label="국가 정보창 닫기"
          />
        </div>
      ) : null}
    </aside>
  );
}
