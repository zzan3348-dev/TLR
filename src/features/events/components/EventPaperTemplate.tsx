import { useState } from "react";
import { EventChoiceButton } from "./EventChoiceButton";

type EventPaperTemplateProps = {
  title: string;
  body: string[];
  choices: string[];
};

export function EventPaperTemplate({
  title,
  body,
  choices,
}: EventPaperTemplateProps) {
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);

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
          <h1 className="eventTitle">{title}</h1>
        </header>

        <div className="eventBody">
          {body.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
        </div>

        <div className="event-paper-template__choices">
          {choices.map((choice, index) => (
            <EventChoiceButton
              key={choice}
              selected={selectedChoice === index}
              onClick={() => setSelectedChoice(index)}
            >
              {choice}
            </EventChoiceButton>
          ))}
        </div>
      </div>
    </article>
  );
}
