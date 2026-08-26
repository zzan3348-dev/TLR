import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EventPaperTemplate } from "./EventPaperTemplate";
import { NewspaperEventTemplate } from "./NewspaperEventTemplate";
import type { DocumentEventData, EventChoice, EventTemplateType, NewspaperEventData, SuperEventData } from "../types";
import { useSuperEventQueue } from "../useSuperEventQueue";
import {
  EVENT_TEST_INITIAL_STATE,
  eventTestSandboxEngine,
} from "../../effects/sandboxEffectEngine";

const BODY_COPY = [
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
];

const EFFECT_CHOICE: EventChoice = {
  id: "restore-order",
  text: "질서를 회복해야 한다.",
  description: "정부는 산업 자원의 일부를 도시 치안에 재배치하여 혼란을 수습하려 합니다.",
  effects: [
    { type: "modify_country_value", targetCountryIds: ["country-013"], statKey: "stability", amount: 3 },
    { type: "modify_country_value", targetCountryIds: ["country-013"], statKey: "productionCapacity", amount: -20 },
    { type: "add_national_spirit", targetCountryIds: ["country-013"], spiritId: "aging-revolution", duration: 180 },
  ],
};

function createSuperTestEvent(): SuperEventData {
  return {
    id: "super-event-test",
    instanceId: crypto.randomUUID(),
    title: "[제목]",
    image: "/images/super-event-test-photo.png",
    imageCrop: { x: 50, y: 50, scale: 1 },
    quote: "글씨글씨글씨",
    attribution: "— 글씨글씨",
    choice: EFFECT_CHOICE,
  };
}

export function EventTestPage() {
  const [templateType, setTemplateType] = useState<EventTemplateType>("super");
  const [choiceCount, setChoiceCount] = useState<1 | 2 | 3>(1);
  const { activeEvent, queuedCount, enqueueSuperEvent } = useSuperEventQueue();
  const initialSuperEvent = useRef<SuperEventData | null>(null);
  if (initialSuperEvent.current === null) initialSuperEvent.current = createSuperTestEvent();
  const sandboxSnapshot = useSyncExternalStore(
    (listener) => eventTestSandboxEngine.subscribe(listener),
    () => eventTestSandboxEngine.snapshot(),
  );
  const choices: EventChoice[] = Array.from({ length: choiceCount }, (_, index) => index === 0
    ? EFFECT_CHOICE
    : { id: `choice-${index + 1}`, text: `선택지 ${index + 1}`, description: "게임 효과가 없는 선택지입니다.", effects: [] });
  const instanceId = `${templateType}-${choiceCount}-test-instance`;
  const documentEvent: DocumentEventData = {
    id: "document-event-test",
    instanceId,
    title: "[제목]",
    body: BODY_COPY,
    choices,
  };
  const newspaperEvent: NewspaperEventData = {
    id: "newspaper-event-test",
    instanceId,
    title: "[제목]",
    body: BODY_COPY.join("\n\n"),
    image: "/assets/country-panels/country-013/leader.png",
    imageCrop: { x: 20, y: 70, scale: 1.4 },
    choices,
  };

  useEffect(() => {
    enqueueSuperEvent(initialSuperEvent.current as SuperEventData);
  }, [enqueueSuperEvent]);

  const selectTemplate = (type: EventTemplateType) => {
    setTemplateType(type);
    if (type === "super") enqueueSuperEvent(createSuperTestEvent());
  };

  return (
    <main className="event-test-page">
      <nav className="event-test-page__controls" aria-label="이벤트 템플릿 테스트 전환">
        <strong>EVENT UI TEST</strong>
        <div aria-label="이벤트 유형">
          {([['document', 'Document'], ['newspaper', 'Newspaper'], ['super', 'Super']] as const).map(([type, label]) => (
            <button
              key={type}
              type="button"
              data-active={templateType === type}
              onClick={() => selectTemplate(type)}
            >
              {label}
            </button>
          ))}
        </div>
        {templateType !== "super" ? <div aria-label="선택지 개수">
          {([1, 2, 3] as const).map((count) => (
            <button
              key={count}
              type="button"
              data-active={choiceCount === count}
              onClick={() => setChoiceCount(count)}
            >
              {count} Choice{count > 1 ? "s" : ""}
            </button>
          ))}
        </div> : null}
      </nav>

      <section className="event-test-page__preview">
        {templateType === "document" ? (
          <EventPaperTemplate
            key={`document-${choiceCount}`}
            event={documentEvent}
          />
        ) : templateType === "newspaper" ? (
          <NewspaperEventTemplate
            key={`newspaper-${choiceCount}`}
            event={newspaperEvent}
          />
        ) : (
          <div className="super-event-test-launcher">
            <strong>SUPER EVENT TEST</strong>
            <span>{activeEvent ? "슈퍼이벤트 상영 중" : "슈퍼이벤트 종료됨"}</span>
            {queuedCount ? <small>대기열 {queuedCount}개</small> : null}
            <button type="button" disabled={Boolean(activeEvent)} onClick={() => enqueueSuperEvent(createSuperTestEvent())}>
              슈퍼이벤트 다시 보기
            </button>
          </div>
        )}
      </section>
      <aside className="event-effect-test-state" aria-label="개발용 이벤트 효과 상태">
        <strong>효과 샌드박스 · 프랑스 인민공화국</strong>
        <span>안정도 {sandboxSnapshot["country-013"]?.stats.stability ?? 0}</span>
        <span>생산능력 {sandboxSnapshot["country-013"]?.stats.productionCapacity ?? 0}</span>
        <span>국민정신 {sandboxSnapshot["country-013"]?.spiritIds.length ?? 0}개</span>
        <button type="button" onClick={() => eventTestSandboxEngine.reset(EVENT_TEST_INITIAL_STATE)}>초기화</button>
      </aside>
    </main>
  );
}
