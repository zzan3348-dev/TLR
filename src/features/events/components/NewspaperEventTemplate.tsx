import { useState } from "react";
import { EventChoiceButton } from "./EventChoiceButton";
import {
  type EventImageCrop,
  type NewspaperEventData,
} from "../types";
import { CroppedEventImage } from "./CroppedEventImage";

type NewspaperEventImageProps = {
  image?: string;
  crop?: Partial<EventImageCrop>;
  alt?: string;
};

export function NewspaperEventImage({
  image,
  crop,
  alt = "",
}: NewspaperEventImageProps) {
  return (
    <CroppedEventImage
      className="newspaper-event-template__photo"
      image={image}
      crop={crop}
      alt={alt}
    />
  );
}

export function NewspaperEventTemplate({ event }: { event: NewspaperEventData }) {
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const paragraphs = event.body.split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <article className="newspaper-event-template" aria-label="신문형 이벤트 미리보기">
      <img
        className="newspaper-event-template__background"
        src="/images/event-newspaper-template.png"
        alt=""
        draggable={false}
      />

      <NewspaperEventImage
        image={event.image}
        crop={event.imageCrop}
        alt={event.image ? `${event.title} 사건 사진` : ""}
      />

      <div className="newspaper-event-template__article">
        <header>
          <h1 className="newspaperEventTitle">{event.title}</h1>
        </header>
        <div className="newspaperEventBody">
          {paragraphs.map((paragraph, index) => (
            <p key={`${event.id}-paragraph-${index}`}>{paragraph}</p>
          ))}
        </div>
      </div>

      {event.choices?.length ? (
        <div className="newspaper-event-template__choices">
          {event.choices.map((choice) => (
            <EventChoiceButton
              key={choice.id}
              selected={selectedChoiceId === choice.id}
              onClick={() => setSelectedChoiceId(choice.id)}
            >
              {choice.label}
            </EventChoiceButton>
          ))}
        </div>
      ) : null}
    </article>
  );
}
