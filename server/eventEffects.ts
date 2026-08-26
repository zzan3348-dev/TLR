import type { AdminClient } from "./auth.js";
import { currentWorldDate, type DiplomacyActor } from "./diplomacy.js";
import { resolveNationalSpiritDefinition } from "../src/features/effects/nationalSpiritRegistry.js";
import { validateEventEffects } from "../src/features/effects/effectValidation.js";
import type { EventEffect } from "../src/features/effects/types.js";

type EventChoiceRow = {
  event_id: string;
  choice_id: string;
  effects: EventEffect[];
};

function cleanIdentifier(value: unknown, maximum = 120): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && /^[A-Za-z0-9:_-]+$/u.test(value)
    ? value
    : null;
}

export function parseEventExecutionBody(body: unknown): {
  eventId: string;
  eventInstanceId: string;
  choiceId: string;
} | null {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const eventId = cleanIdentifier(source.eventId);
  const eventInstanceId = cleanIdentifier(source.eventInstanceId, 180);
  const choiceId = cleanIdentifier(source.choiceId);
  return eventId && eventInstanceId && choiceId ? { eventId, eventInstanceId, choiceId } : null;
}

export async function executeEventChoice(
  admin: AdminClient,
  actor: DiplomacyActor,
  identifiers: { eventId: string; eventInstanceId: string; choiceId: string },
): Promise<{ applied: boolean; duplicate: boolean }> {
  const [eventResult, choiceResult] = await Promise.all([
    admin.from("event_definitions").select("id,status").eq("id", identifiers.eventId).eq("status", "ACTIVE").maybeSingle<{ id: string; status: string }>(),
    admin.from("event_choices").select("event_id,choice_id,effects").eq("event_id", identifiers.eventId).eq("choice_id", identifiers.choiceId).maybeSingle<EventChoiceRow>(),
  ]);
  if (eventResult.error || choiceResult.error) throw new Error("EVENT_DATA_UNAVAILABLE");
  if (!eventResult.data || !choiceResult.data) throw new Error("EVENT_CHOICE_NOT_FOUND");
  const effects = choiceResult.data.effects ?? [];
  validateEventEffects(effects);
  const normalizedEffects = effects.map((effect) => effect.type === "modify_country_value"
    ? effect
    : {
        ...effect,
        resolvedSpiritIds: Object.fromEntries(effect.targetCountryIds.map((countryId) => {
          const spirit = resolveNationalSpiritDefinition(effect.spiritId, countryId);
          if (!spirit) throw new Error(`UNKNOWN_NATIONAL_SPIRIT:${countryId}:${effect.spiritId}`);
          return [countryId, spirit.registryId];
        })),
      });
  const worldDate = await currentWorldDate(admin);
  const { data, error } = await admin.rpc("tlr_apply_event_choice", {
    p_event_instance_id: identifiers.eventInstanceId,
    p_event_id: identifiers.eventId,
    p_choice_id: identifiers.choiceId,
    p_actor_country: actor.countryKey,
    p_effects: normalizedEffects,
    p_world_date: worldDate,
    p_user_id: actor.userId,
  });
  if (error) throw new Error(error.message || "EVENT_EFFECT_TRANSACTION_FAILED");
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return { applied: result.applied === true, duplicate: result.duplicate === true };
}

export function eventEffectError(error: unknown): string {
  const message = error instanceof Error ? error.message : "EVENT_EFFECT_FAILED";
  return message.split("\n", 1)[0].slice(0, 180);
}
