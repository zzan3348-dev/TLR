import { resolveNationalSpiritDefinition } from "./nationalSpiritRegistry";
import { validateEventEffects } from "./effectValidation";
import type {
  CountryStatKey,
  EventChoiceExecution,
  EventChoiceExecutionResult,
  EventEffectExecutor,
} from "./types";

export type SandboxCountryEffectState = {
  stats: Partial<Record<CountryStatKey, number>>;
  spiritIds: string[];
};

export type SandboxEffectSnapshot = Record<string, SandboxCountryEffectState>;

export class SandboxEffectEngine implements EventEffectExecutor {
  private state: SandboxEffectSnapshot;
  private executions = new Set<string>();
  private listeners = new Set<() => void>();

  constructor(initialState: SandboxEffectSnapshot = {}) {
    this.state = structuredClone(initialState);
  }

  snapshot(): SandboxEffectSnapshot {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(nextState: SandboxEffectSnapshot): void {
    this.state = structuredClone(nextState);
    this.executions.clear();
    this.emit();
  }

  async execute(execution: EventChoiceExecution): Promise<EventChoiceExecutionResult> {
    if (this.executions.has(execution.eventInstanceId)) {
      return { applied: false, duplicate: true };
    }
    if (!execution.eventId || !execution.eventInstanceId || !execution.choiceId) {
      throw new Error("INVALID_EVENT_EXECUTION");
    }
    validateEventEffects(execution.effects);
    const next = structuredClone(this.state);
    for (const effect of execution.effects) {
      for (const countryId of effect.targetCountryIds) {
        const country = next[countryId] ?? { stats: {}, spiritIds: [] };
        next[countryId] = country;
        if (effect.type === "modify_country_value") {
          country.stats[effect.statKey] = (country.stats[effect.statKey] ?? 0) + effect.amount;
        } else {
          const resolved = resolveNationalSpiritDefinition(effect.spiritId, countryId);
          const registryId = resolved!.registryId;
          if (effect.type === "add_national_spirit") {
            if (!country.spiritIds.includes(registryId)) country.spiritIds.push(registryId);
          } else {
            country.spiritIds = country.spiritIds.filter((id) => id !== registryId);
          }
        }
      }
    }
    this.state = next;
    this.executions.add(execution.eventInstanceId);
    this.emit();
    return { applied: true, duplicate: false };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const EVENT_TEST_INITIAL_STATE: SandboxEffectSnapshot = {
  "country-013": {
    stats: { stability: 32, productionCapacity: 100 },
    spiritIds: [],
  },
};

export const eventTestSandboxEngine = new SandboxEffectEngine(EVENT_TEST_INITIAL_STATE);
