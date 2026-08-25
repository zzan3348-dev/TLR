import { useState } from "react";
import { EventPaperTemplate } from "./EventPaperTemplate";
import { NewspaperEventTemplate } from "./NewspaperEventTemplate";
import type { EventTemplateType, NewspaperEventData } from "../types";

const BODY_COPY = [
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
];

export function EventTestPage() {
  const [templateType, setTemplateType] = useState<EventTemplateType>("newspaper");
  const [choiceCount, setChoiceCount] = useState<1 | 2 | 3>(1);
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

  return (
    <main className="event-test-page">
      <nav className="event-test-page__controls" aria-label="이벤트 템플릿 테스트 전환">
        <strong>EVENT UI TEST</strong>
        <div aria-label="이벤트 유형">
          {([['document', 'Document'], ['newspaper', 'Newspaper']] as const).map(([type, label]) => (
            <button
              key={type}
              type="button"
              data-active={templateType === type}
              onClick={() => setTemplateType(type)}
            >
              {label}
            </button>
          ))}
        </div>
        <div aria-label="선택지 개수">
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
        </div>
      </nav>

      <section className="event-test-page__preview">
        {templateType === "document" ? (
          <EventPaperTemplate
            key={`document-${choiceCount}`}
            title="[제목]"
            body={BODY_COPY}
            choices={choices}
          />
        ) : (
          <NewspaperEventTemplate
            key={`newspaper-${choiceCount}`}
            event={newspaperEvent}
          />
        )}
      </section>
    </main>
  );
}
