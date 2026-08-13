import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { CountryFlag } from "../../../components/CountryFlag";
import { CountryLeaderInfo } from "../../../components/CountryLeaderInfo";
import { PartySupportChart } from "../../../components/PartySupportChart";
import { getCountryPresentation } from "../../../data/countryPresentation";
import type { MapCountryIndex } from "../../../types/mapCountry";
import type {
  CountryLeaderPresentation,
  CountryNationalSpirit,
} from "../../../types/countryPresentation";
import { getPartyDisplayColor } from "../../../utils/partyColors";
import { readSessionLawChoices, storeSessionLawChoices } from "../../play/playSession";
import { countryDevelopmentStates } from "../data/countryDevelopmentStates";
import { countryLawStates } from "../data/countryLawStates";
import { DEV_DEVELOPMENT_SAMPLE } from "../data/devDevelopmentSample";
import { DEV_LAW_SAMPLE } from "../data/devLawSample";
import { lawDefinitions } from "../data/lawDefinitions";
import type { LawCategory, LawDefinition } from "../types/laws";
import { DevelopmentSection } from "./DevelopmentSection";
import { LawDetailModal } from "./LawDetailModal";
import { LawSection } from "./LawSection";
import { PoliticsWindowShell } from "./PoliticsWindowShell";

type PoliticsPanelProps = {
  country: MapCountryIndex;
  onClose: () => void;
  onExitPlayMode: () => void;
};

const SECTION_META: readonly {
  category: LawCategory;
  title: string;
  icon: string;
}[] = [
  { category: "political", title: "정치법", icon: "sections/political" },
  { category: "military", title: "군사 정책", icon: "sections/military" },
  { category: "economy", title: "경제법", icon: "sections/economy" },
  { category: "social", title: "사회법", icon: "sections/social" },
];

export function PoliticsNationalSpirits({
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
    clientX: number,
    clientY: number,
  ) => {
    const width = Math.min(330, window.innerWidth - 24);
    const height = Math.min(420, window.innerHeight - 24);
    setTooltip({
      spirit,
      x: Math.max(12, Math.min(clientX + 16, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(clientY + 16, window.innerHeight - height - 12)),
    });
  };

  return (
    <>
      <div>
        {spirits.slice(0, 8).map((spirit) =>
          spirit.imagePath ? (
            <img
              key={spirit.id}
              src={spirit.imagePath}
              alt={spirit.name}
              draggable={false}
              onPointerEnter={(event) =>
                showTooltip(spirit, event.clientX, event.clientY)
              }
              onPointerMove={(event) =>
                showTooltip(spirit, event.clientX, event.clientY)
              }
              onPointerLeave={() => setTooltip(null)}
            />
          ) : null,
        )}
      </div>

      {tooltip
        ? createPortal(
            <aside
              className="national-spirit-tooltip politics-national-spirit-tooltip"
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

export function PoliticsLeaderInfo({
  leader,
}: {
  leader: CountryLeaderPresentation;
}) {
  return (
    <CountryLeaderInfo
      leader={leader}
      triggerClassName="politics-template__leader-trigger"
      triggerLabel="지도자 설명 보기"
    >
      <strong>{leader.name || "지도자 미설정"}</strong>
    </CountryLeaderInfo>
  );
}

export function PoliticsPanel({
  country,
  onClose,
  onExitPlayMode,
}: PoliticsPanelProps) {
  const presentation = getCountryPresentation(country);
  const actualLawState = countryLawStates[country.key];
  const actualDevelopmentState = countryDevelopmentStates[country.key];
  const usesLawFixture = !actualLawState && import.meta.env.DEV;
  const usesDevelopmentFixture = !actualDevelopmentState && import.meta.env.DEV;
  const baseLawState = actualLawState ?? (usesLawFixture ? DEV_LAW_SAMPLE : null);
  const developmentState =
    actualDevelopmentState ??
    (usesDevelopmentFixture
      ? DEV_DEVELOPMENT_SAMPLE
      : {
          countryId: country.key,
          povertyRate: null,
          povertyChange: null,
          items: [],
        });
  const [choices, setChoices] = useState<Record<string, string>>(() => ({
    ...(baseLawState?.laws ?? {}),
    ...readSessionLawChoices(country.key),
  }));
  const [selectedLaw, setSelectedLaw] = useState<LawDefinition | null>(null);

  const definitionsByCategory = useMemo(
    () =>
      new Map(
        SECTION_META.map(({ category }) => [
          category,
          lawDefinitions.filter(
            (definition) => definition.category === category,
          ),
        ]),
      ),
    [],
  );

  const selectLawOption = useCallback(
    (lawId: string, optionId: string) => {
      setChoices((current) => {
        const next = { ...current, [lawId]: optionId };
        storeSessionLawChoices(country.key, next);
        return next;
      });
    },
    [country.key],
  );

  const primaryParty = presentation.politics.parties[0] ?? null;
  const rulingIdeology =
    primaryParty?.subIdeology || presentation.politics.subIdeology || "미설정";
  const panelStyle = {
    "--country-accent": country.color,
    "--primary-party-color": primaryParty
      ? getPartyDisplayColor(primaryParty, 0)
      : "#54615f",
  } as CSSProperties;

  return (
    <>
      <PoliticsWindowShell
        ariaLabel={`${presentation.title} 정치`}
        style={panelStyle}
        flag={
          <CountryFlag
            country={country}
            flagPath={presentation.flagPath}
            className="politics-template__flag-underlay"
          />
        }
        portraitPath={presentation.leader.portraitPath}
        regions={{
          ideology: (
            <>
              {presentation.politics.symbolPath ? (
                <img
                  src={presentation.politics.symbolPath}
                  alt=""
                  draggable={false}
                />
              ) : null}
              <small>{rulingIdeology}</small>
            </>
          ),
          identity: (
            <>
              <small>플레이 국가</small>
              <h1 title={presentation.title}>{presentation.title}</h1>
              <p title={presentation.secondaryNames[0] || undefined}>
                {presentation.secondaryNames[0] || "국가 표기 미설정"}
              </p>
              <strong
                title={
                  primaryParty?.name ||
                  presentation.politics.rulingParty ||
                  undefined
                }
              >
                {primaryParty?.name ||
                  presentation.politics.rulingParty ||
                  "정당 미설정"}
              </strong>
            </>
          ),
          nationalSpirits: (
            <>
              <header>
                <strong>국민정신</strong>
                <span>{presentation.nationalSpirits.length}</span>
              </header>
              <PoliticsNationalSpirits
                spirits={presentation.nationalSpirits}
              />
            </>
          ),
          leaderCaption: <PoliticsLeaderInfo leader={presentation.leader} />,
          partySupport: (
            <>
              <PartySupportChart
                parties={presentation.politics.parties}
                rulingPartyName={presentation.politics.rulingParty}
              />
            </>
          ),
          governmentSystem: <span>업데이트 예정</span>,
          powerBase: (
            <>
              <span>업데이트 예정</span>
              <span>업데이트 예정</span>
              <span>업데이트 예정</span>
            </>
          ),
          lawScroll: (
            <>
              <header>
                <div>
                  <strong>국가 법률</strong>
                  <span>정치·군사·경제·사회 제도</span>
                </div>
                <button type="button" onClick={onExitPlayMode}>
                  국가선택
                </button>
              </header>
              <div className="politics-template__law-scroll">
                {SECTION_META.map(({ category, title, icon }) => (
                  <LawSection
                    key={category}
                    id={category}
                    title={title}
                    icon={icon}
                    definitions={definitionsByCategory.get(category) ?? []}
                    choices={choices}
                    onOpenLaw={setSelectedLaw}
                  />
                ))}
                <DevelopmentSection
                  state={developmentState}
                />
              </div>
            </>
          ),
        }}
        onClose={onClose}
      />

      <LawDetailModal
        definition={selectedLaw}
        selectedOptionId={
          selectedLaw ? choices[selectedLaw.id] ?? null : null
        }
        onSelect={selectLawOption}
        onClose={() => setSelectedLaw(null)}
      />
    </>
  );
}
