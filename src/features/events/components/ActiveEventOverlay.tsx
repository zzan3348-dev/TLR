import { useEffect, useState } from "react";
import type { EventChoice, EventImageCrop, EventTemplateType } from "../types";
import { EventPaperTemplate } from "./EventPaperTemplate";
import { NewspaperEventTemplate } from "./NewspaperEventTemplate";
import { SuperEventTemplate } from "./SuperEventTemplate";

type PendingEvent = {
  id: string;
  instanceId: string;
  templateType: EventTemplateType;
  title: string;
  body: string;
  image?: string;
  imageCrop: EventImageCrop;
  quote?: string;
  attribution?: string;
  choices: EventChoice[];
};

async function fetchPendingEvents(): Promise<PendingEvent[]> {
  const response = await fetch("/api/events/pending", { credentials: "include" });
  if (!response.ok) throw new Error("EVENT_DELIVERY_UNAVAILABLE");
  const payload = await response.json() as { events?: PendingEvent[] };
  return payload.events ?? [];
}

export function ActiveEventOverlay({ countryKey }: { countryKey: string }) {
  const [events, setEvents] = useState<PendingEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const apply = () => void fetchPendingEvents().then((pending) => { if (active) { setEvents(pending); setError(null); } }).catch(() => { if (active) setError("이벤트를 불러오지 못했습니다."); });
    apply();
    const refresh = () => apply();
    window.addEventListener("tlr:events-updated", refresh);
    return () => { active = false; window.removeEventListener("tlr:events-updated", refresh); };
  }, [countryKey]);

  const event = events[0];
  if (error && !event) return <aside className="active-event-error" role="alert">{error}</aside>;
  if (!event) return null;
  const finish = () => setEvents((current) => current.slice(1));
  if (event.templateType === "newspaper") return <div className="active-event-overlay"><NewspaperEventTemplate key={event.instanceId} event={{ ...event }} onFinished={finish} /></div>;
  if (event.templateType === "super") return <SuperEventTemplate key={event.instanceId} event={{ ...event, choice: event.choices[0] ?? { id: "acknowledge", text: "확인", effects: [] } }} onFinished={finish} />;
  return <div className="active-event-overlay"><EventPaperTemplate key={event.instanceId} event={{ ...event, body: event.body.split(/\n{2,}/u).filter(Boolean) }} onFinished={finish} /></div>;
}
