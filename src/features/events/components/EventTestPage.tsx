import { useState } from "react";
import { EventPaperTemplate } from "./EventPaperTemplate";

const BODY_COPY = [
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
  "글씨글씨글씨 글씨글씨글씨 글씨글씨글씨.",
];

export function EventTestPage() {
  const [choiceCount, setChoiceCount] = useState<1 | 2 | 3>(1);
  const choices = Array.from(
    { length: choiceCount },
    (_, index) => `선택지 ${index + 1}`,
  );

  return (
    <main className="event-test-page">
      <nav className="event-test-page__controls" aria-label="선택지 개수 전환">
        <strong>EVENT UI TEST</strong>
        <div>
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
        <EventPaperTemplate
          key={choiceCount}
          title="[제목]"
          body={BODY_COPY}
          choices={choices}
        />
      </section>
    </main>
  );
}
