import type { EventChoice, EventImageCrop, EventTemplateType } from "../events/types";

export type ManagementPublishState = "DRAFT" | "READY" | "PUBLISHED" | "ARCHIVED";

export type ManagementConditionLeaf = {
  id: string;
  kind: "country" | "stability" | "warSupport" | "atWar" | "ideology" | "worldDate" | "turn";
  operator: "equals" | "notEquals" | "gte" | "lte" | "before" | "after";
  value: string | number | boolean;
};

export type ManagementConditionGroup = {
  id: string;
  mode: "ALL" | "ANY";
  conditions: ManagementConditionLeaf[];
};

export type ManagementEventTrigger = {
  mode: "manual" | "worldDateReached" | "turnStarted" | "turnEnded" | "conditional";
  worldDate?: string;
  turnId?: number;
  eventKey?: string;
};

export type ManagementEventDelivery = {
  id: string;
  countryKey: string;
  availableWorldDate: string;
  createdAt: string;
};

export type ManagementEventDraft = {
  id: string;
  title: string;
  templateType: EventTemplateType;
  body: string;
  image?: string;
  imageCrop: EventImageCrop;
  quote?: string;
  attribution?: string;
  choices: EventChoice[];
  targetCountryIds: string[];
  trigger: ManagementEventTrigger;
  conditions: ManagementConditionGroup;
  publishState: ManagementPublishState;
  deliveries: ManagementEventDelivery[];
  updatedAt?: string;
};

export type ManagementContentPayload = {
  events: ManagementEventDraft[];
  decisions: Array<{
    id: string;
    title: string;
    category: string;
    description: string;
    icon: string;
    politicalPowerCost: number;
    conditions: readonly string[];
    effects: readonly string[];
    cooldownTurns: number;
    durationTurns?: number;
  }>;
  assets: Array<{ id: string; path: string; label: string; kind: "event" | "decision" | "portrait" }>;
  countries: Array<{ key: string; name: string }>;
  nationalSpirits: Array<{ registryId: string; countryKey: string; name: string }>;
};

export const EMPTY_CONDITION_GROUP: ManagementConditionGroup = {
  id: "root",
  mode: "ALL",
  conditions: [],
};

export function createEmptyEventDraft(): ManagementEventDraft {
  return {
    id: `event_${Date.now().toString(36)}`,
    title: "새 이벤트",
    templateType: "document",
    body: "이벤트 본문을 입력하십시오.",
    imageCrop: { x: 50, y: 50, scale: 1 },
    choices: [{ id: "choice_1", text: "확인", description: "", effects: [] }],
    targetCountryIds: [],
    trigger: { mode: "manual" },
    conditions: EMPTY_CONDITION_GROUP,
    publishState: "DRAFT",
    deliveries: [],
  };
}
