export type CountryStatKey =
  | "stability"
  | "warSupport"
  | "politicalPower"
  | "productionCapacity"
  | "nationalIncome"
  | "foreignReserves"
  | "researchPower"
  | "povertyRate";

export type ModifyCountryValueEffect = {
  type: "modify_country_value";
  targetCountryIds: string[];
  statKey: CountryStatKey;
  amount: number;
};

export type AddNationalSpiritEffect = {
  type: "add_national_spirit";
  targetCountryIds: string[];
  spiritId: string;
  /** TLR 세계 시간 기준 유지 일수. null 또는 미지정은 영구 적용이다. */
  duration?: number | null;
};

export type RemoveNationalSpiritEffect = {
  type: "remove_national_spirit";
  targetCountryIds: string[];
  spiritId: string;
};

export type EventEffect =
  | ModifyCountryValueEffect
  | AddNationalSpiritEffect
  | RemoveNationalSpiritEffect;

export type EventChoiceExecution = {
  eventId: string;
  eventInstanceId: string;
  choiceId: string;
  effects: readonly EventEffect[];
};

export type EventChoiceExecutionResult = {
  applied: boolean;
  duplicate: boolean;
};

export type EventEffectExecutor = {
  execute(execution: EventChoiceExecution): Promise<EventChoiceExecutionResult>;
};
