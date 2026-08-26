import { useEffect, useState } from "react";
import { EventPaperTemplate } from "./EventPaperTemplate";
import { NewspaperEventTemplate } from "./NewspaperEventTemplate";
import type { EventTemplateType, NewspaperEventData, SuperEventData } from "../types";
import { useSuperEventQueue } from "../useSuperEventQueue";

const BODY_COPY = [
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
];

const SUPER_TEST_EVENT: SuperEventData = {
  id: "super-event-test",
  title: "[제목]",
  image: "/images/super-event-test-photo.png",
  imageCrop: { x: 50, y: 50, scale: 1 },
  quote: "글씨글씨글씨",
  attribution: "— 글씨글씨",
  buttonText: "선택지 1",
};

export function EventTestPage() {
  const [templateType, setTemplateType] = useState<EventTemplateType>("super");
  const [choiceCount, setChoiceCount] = useState<1 | 2 | 3>(1);
  const { activeEvent, queuedCount, enqueueSuperEvent } = useSuperEventQueue();
  const choices = Array.from(
    { length: choiceCount },
    (_, index) => `선택지 ${index + 1}`,
  );
  const newspaperEvent: NewspaperEventData = {
    id: "newspaper-event-test",
    title: "[제목]",
    body: BODY_COPY.join("\n\n"),
    image: "/assets/country-panels/country-013/leader.png",
    imageCrop: { x: 20, y: 70, scale: 1.4 },
    choices: choices.map((label, index) => ({ id: `choice-${index + 1}`, label })),
  };

  useEffect(() => {
    enqueueSuperEvent(SUPER_TEST_EVENT);
  }, [enqueueSuperEvent]);

  const selectTemplate = (type: EventTemplateType) => {
    setTemplateType(type);
    if (type === "super") enqueueSuperEvent(SUPER_TEST_EVENT);
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
            title="[제목]"
            body={BODY_COPY}
            choices={choices}
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
            <button type="button" disabled={Boolean(activeEvent)} onClick={() => enqueueSuperEvent(SUPER_TEST_EVENT)}>
              슈퍼이벤트 다시 보기
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
