import { useState } from "react";
import { EventChoiceButton } from "./EventChoiceButton";
import type { DocumentEventData } from "../types";

type EventPaperTemplateProps = {
  event: DocumentEventData;
  onFinished?: () => void;
};

export function EventPaperTemplate({
  event,
  onFinished,
}: EventPaperTemplateProps) {
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  return (
    <article className="event-paper-template" aria-label="이벤트 미리보기">
      <img
        className="event-paper-template__background"
        src="/images/event-paper-template.png"
        alt=""
        draggable={false}
      />
      <div className="event-paper-template__content">
        <header className="event-paper-template__header">
          <h1 className="eventTitle">{event.title}</h1>
        </header>

        <div className="eventBody">
          {event.body.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
        </div>

        <div className="event-paper-template__choices">
          {event.choices.map((choice) => (
            <EventChoiceButton
              key={choice.id}
              eventId={event.id}
              eventInstanceId={event.instanceId}
              choice={choice}
              selected={selectedChoiceId === choice.id}
              onApplied={() => {
                setSelectedChoiceId(choice.id);
                onFinished?.();
              }}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
