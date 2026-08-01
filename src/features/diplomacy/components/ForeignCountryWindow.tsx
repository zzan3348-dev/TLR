import { useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { CountryFlag } from "../../../components/CountryFlag";
import { PartySupportChart } from "../../../components/PartySupportChart";
import { UiIcon } from "../../../components/UiIcon";
import { getCountryPresentation } from "../../../data/countryPresentation";
import type { CountryNationalSpirit } from "../../../types/countryPresentation";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { getPartyDisplayColor } from "../../../utils/partyColors";
import { PoliticsWindowShell } from "../../politics/components/PoliticsWindowShell";

type ForeignCountryWindowProps = {
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
  onClose: () => void;
};

const ACTIONS = [
  ["diplomacy/message", "외교 전문 발송", "공식 입장을 전달하고 협상을 시작합니다."],
  ["diplomacy/relations", "관계 개선", "양국 간의 정치적 신뢰를 높입니다."],
  ["diplomacy/trade", "교역 제안", "무역 협정과 자원 교환을 검토합니다."],
  ["diplomacy/treaty", "조약 검토", "공동 방위와 불가침 조항을 검토합니다."],
  ["diplomacy/intel", "첩보망 구축", "대상국의 상황과 정책을 파악합니다."],
  ["diplomacy/relations", "주재무관 파견", "현지 정세와 정부의 의향을 파악합니다."],
  ["diplomacy/treaty", "군사 협력 요청", "공동 방위와 군사 협력 가능성을 확인합니다."],
] as const;

function ForeignNationalSpirits({
  spirits,
}: {
  spirits: readonly CountryNationalSpirit[];
}) {
  const [tooltip, setTooltip] = useState<{
    spirit: CountryNationalSpirit;
    x: number;
    y: number;
  } | null>(null);

  const showTooltip = (
    spirit: CountryNationalSpirit,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const width = Math.min(310, window.innerWidth - 24);
    const height = Math.min(360, window.innerHeight - 24);
    setTooltip({
      spirit,
      x: Math.max(12, Math.min(event.clientX + 14, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(event.clientY + 14, window.innerHeight - height - 12)),
    });
  };

  return (
    <>
      <header>
        <strong>국민정신</strong>
        <span>{spirits.length}</span>
      </header>
      <div>
        {spirits.slice(0, 8).map((spirit) =>
          spirit.imagePath ? (
            <button
              key={spirit.id}
              type="button"
              aria-label={spirit.name}
              onPointerEnter={(event) => showTooltip(spirit, event)}
              onPointerMove={(event) => showTooltip(spirit, event)}
              onPointerLeave={() => setTooltip(null)}
              onFocus={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setTooltip({
                  spirit,
                  x: Math.max(12, Math.min(bounds.right + 12, window.innerWidth - 322)),
                  y: Math.max(12, bounds.top),
                });
              }}
              onBlur={() => setTooltip(null)}
            >
              <img src={spirit.imagePath} alt="" draggable={false} />
            </button>
          ) : null,
        )}
      </div>
      {tooltip
        ? createPortal(
            <aside
              className="national-spirit-tooltip politics-national-spirit-tooltip diplomacy-national-spirit-tooltip"
              style={{ left: tooltip.x, top: tooltip.y }}
              role="tooltip"
            >
              <h3>{tooltip.spirit.name}</h3>
              <p>{tooltip.spirit.description}</p>
              <ul>
                {tooltip.spirit.effects.map((effect) => (
                  <li key={`${effect.tone}:${effect.text}`} data-tone={effect.tone}>
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

function DiplomacyActions({ playerCountry, targetCountry }: {
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
}) {
  return (
    <div className="diplomacy-template__actions">
      <div className="diplomacy-template__actions-intro">
        <UiIcon name="menu/diplomacy" />
        <div>
          <strong>외교 행동</strong>
          <small>{playerCountry.name}와 {targetCountry.name} 사이에서 선택할 수 있는 행동</small>
        </div>
      </div>
      <div className="diplomacy-template__action-list">
        {ACTIONS.map(([icon, name, description]) => (
          <button key={name} type="button" disabled aria-label={`${name} 잠금`}>
            <UiIcon name={icon} />
            <span>
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
            <i aria-hidden="true">잠금</i>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ForeignCountryWindow({
  playerCountry,
  targetCountry,
  onClose,
}: ForeignCountryWindowProps) {
  const presentation = getCountryPresentation(targetCountry);
  const primaryParty = presentation.politics.parties[0] ?? null;
  const partyName = primaryParty?.name || presentation.politics.rulingParty || "정당 미설정";
  const ideology = primaryParty?.ideology || presentation.politics.ideology || "사상 미설정";
  const panelStyle = useMemo(
    () => ({
      "--country-accent": targetCountry.color,
      "--primary-party-color": primaryParty
        ? getPartyDisplayColor(primaryParty, 0)
        : "#54615f",
    }) as CSSProperties,
    [primaryParty, targetCountry.color],
  );

  return (
    <PoliticsWindowShell
      ariaLabel={`${presentation.title} 외교`}
      style={panelStyle}
      flag={
        <CountryFlag
          country={targetCountry}
          flagPath={presentation.flagPath}
          className="politics-template__flag-underlay"
        />
      }
      portraitPath={presentation.leader.portraitPath}
      regions={{
        ideology: (
          <>
            {presentation.politics.symbolPath ? (
              <img src={presentation.politics.symbolPath} alt="" draggable={false} />
            ) : null}
            <small>{presentation.politics.faction || "비동맹"}</small>
          </>
        ),
        identity: (
          <>
            <small>외교 대상국</small>
            <h1>{presentation.title}</h1>
            <p>
              {presentation.secondaryNames[0] || "국가 표기 미설정"}
            </p>
            <strong>{partyName}</strong>
          </>
        ),
        nationalSpirits: <ForeignNationalSpirits spirits={presentation.nationalSpirits} />,
        leaderCaption: <strong>{presentation.leader.name || "지도자 미설정"}</strong>,
        partySupport: (
          <>
            <div className="politics-template__party-heading">
              {presentation.politics.symbolPath ? (
                <img src={presentation.politics.symbolPath} alt="" draggable={false} />
              ) : null}
              <div>
                <strong>{partyName}</strong>
                <span>{ideology}</span>
              </div>
            </div>
            <PartySupportChart parties={presentation.politics.parties} />
          </>
        ),
        governmentSystem: <span>{presentation.politics.government || "정부 형태 미설정"}</span>,
        powerBase: (
          <>
            <span>{presentation.politics.faction || "비동맹"}</span>
            <span>관계 0.00 · 정보망 0 / 0</span>
          </>
        ),
        lawScroll: (
          <>
            <header>
              <div>
                <strong>외교 행동</strong>
                <span>국가 간 관계와 협력 수단</span>
              </div>
              <span className="diplomacy-template__target-label">대상: {presentation.title}</span>
            </header>
            <div className="politics-template__law-scroll">
              <DiplomacyActions playerCountry={playerCountry} targetCountry={targetCountry} />
            </div>
          </>
        ),
      }}
      onClose={onClose}
    />
  );
}
