import { mapCountries } from "../../../src/data/mapCountries.js";
import { COMMON_DECISIONS } from "../../../src/features/decisions/data/commonDecisions.js";
import { validateEventEffects } from "../../../src/features/effects/effectValidation.js";
import { listNationalSpiritDefinitions } from "../../../src/features/effects/nationalSpiritRegistry.js";
import type { EventChoice, EventTemplateType } from "../../../src/features/events/types.js";
import type { ManagementConditionGroup, ManagementEventDraft, ManagementEventTrigger, ManagementPublishState } from "../../../src/features/management/types.js";
import { requireAdminSession } from "../../adminAuth.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

type DefinitionRow = { id: string; template_type: EventTemplateType; title: string; payload: Record<string, unknown>; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; updated_at: string };
type ChoiceRow = { event_id: string; choice_id: string; text: string; description: string | null; effects: EventChoice["effects"]; sort_order: number };

const EVENT_ID = /^[a-z0-9][a-z0-9_-]{2,79}$/u;
const TEMPLATE_TYPES = new Set<EventTemplateType>(["document", "newspaper", "super"]);
const PUBLISH_STATES = new Set<ManagementPublishState>(["DRAFT", "READY", "PUBLISHED", "ARCHIVED"]);
const TRIGGER_MODES = new Set(["manual", "worldDateReached", "turnStarted", "turnEnded", "conditional", "reactive"]);

const ASSETS = [
  { id: "event-document", path: "/images/event-paper-template.png", label: "문서형 이벤트 프레임", kind: "event" as const },
  { id: "event-newspaper", path: "/images/event-newspaper-template.png", label: "신문형 이벤트 프레임", kind: "event" as const },
  { id: "event-super", path: "/images/super-event-frame.png", label: "슈퍼이벤트 프레임", kind: "event" as const },
  ...COMMON_DECISIONS.map((decision) => ({ id: `decision-${decision.id}`, path: decision.icon, label: decision.title, kind: "decision" as const })),
];

function safeText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeConditions(value: unknown): ManagementConditionGroup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { id: "root", mode: "ALL", conditions: [] };
  const source = value as Partial<ManagementConditionGroup>;
  return {
    id: safeText(source.id, 80) || "root",
    mode: source.mode === "ANY" ? "ANY" : "ALL",
    conditions: Array.isArray(source.conditions) ? source.conditions.slice(0, 32).filter((item) => item && typeof item === "object").map((item, index) => {
      const condition = item as Record<string, unknown>;
      const kind = ["country", "stability", "warSupport", "atWar", "ideology", "worldDate", "turn"].includes(String(condition.kind)) ? condition.kind as ManagementConditionGroup["conditions"][number]["kind"] : "country";
      const operator = ["equals", "notEquals", "gte", "lte", "before", "after"].includes(String(condition.operator)) ? condition.operator as ManagementConditionGroup["conditions"][number]["operator"] : "equals";
      const rawValue = condition.value;
      const normalizedValue = typeof rawValue === "boolean" || typeof rawValue === "number" ? rawValue : safeText(rawValue, 120);
      return { id: safeText(condition.id, 80) || `condition_${index + 1}`, kind, operator, value: normalizedValue };
    }) : [],
  };
}

function normalizeTrigger(value: unknown): ManagementEventTrigger {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = TRIGGER_MODES.has(String(source.mode)) ? source.mode as ManagementEventTrigger["mode"] : "manual";
  return { mode, worldDate: safeText(source.worldDate, 10) || undefined, turnId: Number.isInteger(source.turnId) ? Number(source.turnId) : undefined, eventKey: safeText(source.eventKey, 100) || undefined };
}

function normalizeDraft(value: unknown): ManagementEventDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_EVENT_DRAFT");
  const source = value as Record<string, unknown>;
  const id = safeText(source.id, 80).toLowerCase();
  const title = safeText(source.title, 180);
  const templateType = source.templateType as EventTemplateType;
  const publishState = source.publishState as ManagementPublishState;
  if (!EVENT_ID.test(id) || !title || !TEMPLATE_TYPES.has(templateType) || !PUBLISH_STATES.has(publishState)) throw new Error("INVALID_EVENT_DRAFT");
  const choices = (Array.isArray(source.choices) ? source.choices : []).slice(0, templateType === "super" ? 1 : 8).map((item, index) => {
    const choice = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const normalized: EventChoice = {
      id: safeText(choice.id, 80).toLowerCase() || `choice_${index + 1}`,
      text: safeText(choice.text, 240),
      description: safeText(choice.description, 600),
      effects: Array.isArray(choice.effects) ? choice.effects as EventChoice["effects"] : [],
    };
    if (!normalized.text || !EVENT_ID.test(normalized.id)) throw new Error("INVALID_EVENT_CHOICE");
    validateEventEffects(normalized.effects ?? []);
    return normalized;
  });
  if (!choices.length) throw new Error("EVENT_CHOICE_REQUIRED");
  const countryIds = new Set(mapCountries.map((country) => country.key));
  const targetCountryIds = (Array.isArray(source.targetCountryIds) ? source.targetCountryIds : []).map(String).filter((id) => countryIds.has(id)).slice(0, mapCountries.length);
  const crop = source.imageCrop && typeof source.imageCrop === "object" ? source.imageCrop as Record<string, unknown> : {};
  return {
    id,
    title,
    templateType,
    body: safeText(source.body, 12000),
    image: safeText(source.image, 1000) || undefined,
    imageCrop: {
      x: Math.min(100, Math.max(0, Number(crop.x) || 50)),
      y: Math.min(100, Math.max(0, Number(crop.y) || 50)),
      scale: Math.min(4, Math.max(1, Number(crop.scale) || 1)),
    },
    quote: safeText(source.quote, 1200) || undefined,
    attribution: safeText(source.attribution, 240) || undefined,
    choices,
    targetCountryIds,
    trigger: normalizeTrigger(source.trigger),
    conditions: normalizeConditions(source.conditions),
    publishState,
  };
}

function workflowState(row: DefinitionRow): ManagementPublishState {
  if (row.status === "ACTIVE") return "PUBLISHED";
  if (row.status === "ARCHIVED") return "ARCHIVED";
  return row.payload.workflowState === "READY" ? "READY" : "DRAFT";
}

async function readContent(admin: ReturnType<typeof getAdminClient>) {
  const [definitions, choices] = await Promise.all([
    admin.from("event_definitions").select("id,template_type,title,payload,status,updated_at").order("updated_at", { ascending: false }).returns<DefinitionRow[]>(),
    admin.from("event_choices").select("event_id,choice_id,text,description,effects,sort_order").order("sort_order", { ascending: true }).returns<ChoiceRow[]>(),
  ]);
  if (definitions.error || choices.error) throw definitions.error ?? choices.error;
  const choiceMap = new Map<string, ChoiceRow[]>();
  for (const choice of choices.data ?? []) choiceMap.set(choice.event_id, [...(choiceMap.get(choice.event_id) ?? []), choice]);
  return {
    events: (definitions.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      templateType: row.template_type,
      body: safeText(row.payload.body, 12000),
      image: safeText(row.payload.image, 1000) || undefined,
      imageCrop: row.payload.imageCrop ?? { x: 50, y: 50, scale: 1 },
      quote: safeText(row.payload.quote, 1200) || undefined,
      attribution: safeText(row.payload.attribution, 240) || undefined,
      choices: (choiceMap.get(row.id) ?? []).map((choice) => ({ id: choice.choice_id, text: choice.text, description: choice.description ?? undefined, effects: choice.effects ?? [] })),
      targetCountryIds: Array.isArray(row.payload.targetCountryIds) ? row.payload.targetCountryIds : [],
      trigger: normalizeTrigger(row.payload.trigger),
      conditions: normalizeConditions(row.payload.conditions),
      publishState: workflowState(row),
      updatedAt: row.updated_at,
    })),
    decisions: COMMON_DECISIONS,
    assets: ASSETS,
    countries: mapCountries.map(({ key, name }) => ({ key, name })),
    nationalSpirits: listNationalSpiritDefinitions().map(({ registryId, countryKey, name }) => ({ registryId, countryKey, name })),
  };
}

async function persistEvent(admin: ReturnType<typeof getAdminClient>, draft: ManagementEventDraft) {
  const databaseStatus = draft.publishState === "PUBLISHED" ? "ACTIVE" : draft.publishState === "ARCHIVED" ? "ARCHIVED" : "DRAFT";
  const payload = {
    body: draft.body, image: draft.image, imageCrop: draft.imageCrop, quote: draft.quote, attribution: draft.attribution,
    targetCountryIds: draft.targetCountryIds, trigger: draft.trigger, conditions: draft.conditions, workflowState: draft.publishState,
  };
  const definition = await admin.from("event_definitions").upsert({ id: draft.id, template_type: draft.templateType, title: draft.title, payload, status: databaseStatus, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (definition.error) throw definition.error;
  const removed = await admin.from("event_choices").delete().eq("event_id", draft.id);
  if (removed.error) throw removed.error;
  const inserted = await admin.from("event_choices").insert(draft.choices.map((choice, index) => ({ event_id: draft.id, choice_id: choice.id, text: choice.text, description: choice.description || null, effects: choice.effects ?? [], sort_order: index, updated_at: new Date().toISOString() })));
  if (inserted.error) throw inserted.error;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) return void response.status(503).json({ error: "CONTENT_STUDIO_SERVER_NOT_CONFIGURED" });
  const admin = getAdminClient(env);
  try {
    if (request.method === "GET") return void response.status(200).json(await readContent(admin));
    if (request.method !== "POST") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const action = safeText(body.action, 40);
    if (action === "SAVE_EVENT") {
      const draft = normalizeDraft(body.event);
      await persistEvent(admin, draft);
      return void response.status(200).json(await readContent(admin));
    }
    if (action === "CLONE_EVENT") {
      const draft = normalizeDraft(body.event);
      draft.id = `${draft.id}_copy_${Date.now().toString(36)}`.slice(0, 80);
      draft.title = `${draft.title} 복제본`.slice(0, 180);
      draft.publishState = "DRAFT";
      await persistEvent(admin, draft);
      return void response.status(200).json(await readContent(admin));
    }
    return void response.status(400).json({ error: "INVALID_CONTENT_STUDIO_ACTION" });
  } catch (error) {
    console.error("admin content studio failed", error);
    const code = error instanceof Error && error.message.startsWith("INVALID_") ? error.message : "CONTENT_STUDIO_UNAVAILABLE";
    response.status(code === "CONTENT_STUDIO_UNAVAILABLE" ? 503 : 400).json({ error: code });
  }
}
