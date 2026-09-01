import type { EventChoice, EventTemplateType } from "../src/features/events/types.js";
import type { ManagementConditionGroup, ManagementEventTrigger } from "../src/features/management/types.js";
import type { AdminClient } from "./auth.js";
import { loadDecisionRuntime } from "./decisions.js";
import { evaluateManagementConditions } from "./managementConditions.js";

type EventDefinitionRow = {
  id: string;
  template_type: EventTemplateType;
  title: string;
  payload: Record<string, unknown>;
};
type EventChoiceRow = { event_id: string; choice_id: string; text: string; description: string | null; effects: EventChoice["effects"]; sort_order: number };

export type PendingEvent = {
  id: string;
  instanceId: string;
  templateType: EventTemplateType;
  title: string;
  body: string;
  image?: string;
  imageCrop: { x: number; y: number; scale: number };
  quote?: string;
  attribution?: string;
  choices: EventChoice[];
};

const text = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : "";

function conditions(value: unknown): ManagementConditionGroup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { id: "root", mode: "ALL", conditions: [] };
  const source = value as ManagementConditionGroup;
  return { id: text(source.id, 80) || "root", mode: source.mode === "ANY" ? "ANY" : "ALL", conditions: Array.isArray(source.conditions) ? source.conditions.slice(0, 32) : [] };
}

function trigger(value: unknown): ManagementEventTrigger {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { mode: "manual" };
  const source = value as Partial<ManagementEventTrigger>;
  return ["manual", "worldDateReached", "turnStarted", "turnEnded", "conditional"].includes(String(source.mode))
    ? { mode: source.mode as ManagementEventTrigger["mode"], worldDate: text(source.worldDate, 10) || undefined, turnId: Number.isInteger(source.turnId) ? Number(source.turnId) : undefined }
    : { mode: "manual" };
}

export function eventTriggerInstanceIds(row: Pick<EventDefinitionRow, "id" | "payload">, countryKey: string, worldDate: string, turnNumber: number): string[] {
  const payload = row.payload;
  const rule = trigger(payload.trigger);
  if (rule.mode === "manual") {
    return (Array.isArray(payload.deliveries) ? payload.deliveries : []).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const delivery = item as Record<string, unknown>;
      const id = text(delivery.id, 180);
      return delivery.countryKey === countryKey && text(delivery.availableWorldDate, 10) <= worldDate && id ? [id] : [];
    });
  }
  if (rule.mode === "worldDateReached" && rule.worldDate && worldDate >= rule.worldDate) return [`auto:${row.id}:${countryKey}:date:${rule.worldDate}`];
  if ((rule.mode === "turnStarted" || rule.mode === "turnEnded") && rule.turnId && turnNumber >= rule.turnId) return [`auto:${row.id}:${countryKey}:turn:${rule.mode}:${rule.turnId}`];
  if (rule.mode === "conditional") return [`auto:${row.id}:${countryKey}:condition`];
  return [];
}

export async function loadPendingEvents(admin: AdminClient, countryKey: string): Promise<PendingEvent[]> {
  const [definitions, choiceRows, runtime] = await Promise.all([
    admin.from("event_definitions").select("id,template_type,title,payload").eq("status", "ACTIVE").order("updated_at").returns<EventDefinitionRow[]>(),
    admin.from("event_choices").select("event_id,choice_id,text,description,effects,sort_order").order("sort_order").returns<EventChoiceRow[]>(),
    loadDecisionRuntime(admin, countryKey),
  ]);
  if (definitions.error || choiceRows.error) throw definitions.error ?? choiceRows.error;
  const choices = new Map<string, EventChoice[]>();
  for (const row of choiceRows.data ?? []) choices.set(row.event_id, [...(choices.get(row.event_id) ?? []), { id: row.choice_id, text: row.text, description: row.description ?? undefined, effects: row.effects ?? [] }]);
  const candidates = (definitions.data ?? []).flatMap((row) => {
    const targets = Array.isArray(row.payload.targetCountryIds) ? row.payload.targetCountryIds.map(String) : [];
    if (targets.length > 0 && !targets.includes(countryKey)) return [];
    if (!evaluateManagementConditions(conditions(row.payload.conditions), countryKey, runtime).satisfied) return [];
    return eventTriggerInstanceIds(row, countryKey, runtime.worldDate, runtime.turn).map((instanceId) => ({ row, instanceId }));
  });
  if (candidates.length === 0) return [];
  const executionRows = await admin.from("event_choice_executions").select("event_instance_id").in("event_instance_id", candidates.map((candidate) => candidate.instanceId)).returns<Array<{ event_instance_id: string }>>();
  if (executionRows.error) throw executionRows.error;
  const executed = new Set((executionRows.data ?? []).map((row) => row.event_instance_id));
  return candidates.filter((candidate) => !executed.has(candidate.instanceId)).map(({ row, instanceId }) => {
    const crop = row.payload.imageCrop && typeof row.payload.imageCrop === "object" ? row.payload.imageCrop as Record<string, unknown> : {};
    return {
      id: row.id,
      instanceId,
      templateType: row.template_type,
      title: row.title,
      body: text(row.payload.body, 12000),
      image: text(row.payload.image, 1000) || undefined,
      imageCrop: { x: Number(crop.x) || 50, y: Number(crop.y) || 50, scale: Number(crop.scale) || 1 },
      quote: text(row.payload.quote, 1200) || undefined,
      attribution: text(row.payload.attribution, 240) || undefined,
      choices: choices.get(row.id) ?? [],
    };
  });
}
