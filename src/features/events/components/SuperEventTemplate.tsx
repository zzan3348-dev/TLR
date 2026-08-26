import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SuperEventAudioController } from "../audio/SuperEventAudioController";
import type { SuperEventData, SuperEventProjectionEffect } from "../types";
import { CroppedEventImage } from "./CroppedEventImage";
import { EventChoiceButton } from "./EventChoiceButton";

const DEFAULT_PROJECTION_EFFECT: Required<SuperEventProjectionEffect> = {
  grain: 0.12,
  flicker: 0.08,
  jitter: 0.06,
  vignette: 0.22,
  dust: 0.08,
};

const clampEffect = (value: number | undefined, fallback: number) =>
  Math.min(1, Math.max(0, value ?? fallback));

export function SuperEventTemplate({
  event,
  onFinished,
}: {
  event: SuperEventData;
  onFinished: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const audioRef = useRef<SuperEventAudioController | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const effect = {
    grain: clampEffect(event.projectionEffect?.grain, DEFAULT_PROJECTION_EFFECT.grain),
    flicker: clampEffect(event.projectionEffect?.flicker, DEFAULT_PROJECTION_EFFECT.flicker),
    jitter: clampEffect(event.projectionEffect?.jitter, DEFAULT_PROJECTION_EFFECT.jitter),
    vignette: clampEffect(event.projectionEffect?.vignette, DEFAULT_PROJECTION_EFFECT.vignette),
    dust: clampEffect(event.projectionEffect?.dust, DEFAULT_PROJECTION_EFFECT.dust),
  };
  const style = {
    "--super-grain": effect.grain,
    "--super-flicker": effect.flicker,
    "--super-jitter": effect.jitter,
    "--super-vignette": effect.vignette,
    "--super-dust": effect.dust,
  } as CSSProperties;

  useEffect(() => {
    const audio = new SuperEventAudioController();
    audioRef.current = audio;
    audio.startProjector(event.projectorAudio);
    musicTimerRef.current = window.setTimeout(() => {
      audio.startMusic(event.music);
    }, 1150);
    return () => {
      if (musicTimerRef.current !== null) window.clearTimeout(musicTimerRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      audio.dispose();
      audioRef.current = null;
    };
  }, [event]);

  const finish = () => {
    if (closing) return;
    setClosing(true);
    if (musicTimerRef.current !== null) {
      window.clearTimeout(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    audioRef.current?.stop(event.music, event.projectorAudio);
    finishTimerRef.current = window.setTimeout(onFinished, 720);
  };

  return (
    <div className="super-event-overlay" data-state={closing ? "closing" : "opening"} role="dialog" aria-modal="true" aria-label={`${event.title} 슈퍼이벤트`}>
      <article className="super-event-template" style={style}>
        <img className="super-event-template__frame" src="/images/super-event-frame.png" alt="" draggable={false} />
        <h1 className="superEventTitle">{event.title}</h1>

        <section className="super-event-template__projection" aria-label="사건 이미지">
          <CroppedEventImage
            className="super-event-template__image"
            image={event.image}
            crop={event.imageCrop}
            alt={event.image ? `${event.title} 사건 이미지` : ""}
          />
          <span className="super-event-template__beam" aria-hidden="true" />
          <span className="super-event-template__film" aria-hidden="true" />
          {(event.quote || event.attribution) ? (
            <blockquote className="super-event-template__quote">
              {event.quote ? <p>{event.quote}</p> : null}
              {event.attribution ? <cite>{event.attribution}</cite> : null}
            </blockquote>
          ) : null}
        </section>

        <EventChoiceButton
          eventId={event.id}
          eventInstanceId={event.instanceId}
          choice={event.choice}
          selected={closing}
          onApplied={finish}
          variant="super"
        />
      </article>
    </div>
  );
}
