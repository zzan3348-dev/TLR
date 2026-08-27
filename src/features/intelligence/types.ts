export type IntelligenceDomain = "ECONOMY" | "ADMINISTRATION_POLITICS" | "RESEARCH" | "MILITARY" | "UNDERGROUND";
export type IntelligenceCategory = "INFORMATION" | "COUNTERINTELLIGENCE" | "OPERATIONS" | "TRAINING" | "CRYPTOGRAPHY";
export type IntelligencePhase = "PREPARATION" | "EXECUTION" | "EXTRACTION" | "RESULT";
export type IntelligenceConfidence = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type IntelligenceUpgradeDefinition = {
  key: string; category: IntelligenceCategory; display_name: string; description: string;
  icon_asset_key: string; political_power_cost: number; duration_world_days: number;
  requirements: Record<string, unknown>; modifiers: Record<string, unknown>; publish_status: string;
};

export type SpyOperationDefinition = {
  key: string; display_name: string; description: string; icon_asset_key: string;
  operation_class: "COLLECTION" | "MAJOR"; requirements: { domain?: IntelligenceDomain; infiltration?: number; assets?: number };
  political_power_cost: number; preparation_days: number; execution_days: number; extraction_days: number;
  base_difficulty: number; base_detection_risk: number; admin_review_mode: "NONE" | "REQUIRED";
  cooldown_days: number; result_hooks: Record<string, unknown>; publish_status: string;
};

export type IntelligenceAgency = {
  id: string; country_id: string; display_name: string; emblem_asset_key: string;
  capability: number | null; counterintelligence: number | null; operation_slot_cap: number | null; status: string;
};

export type SpyNetwork = {
  id: string; observer_country_id: string; target_country_id: string;
  economy_infiltration: number; administration_politics_infiltration: number; research_infiltration: number;
  military_infiltration: number; underground_infiltration: number; alertness: number; updated_world_date: string;
};

export type SpyAsset = {
  id: string; observer_country_id: string; target_country_id: string; domain: IntelligenceDomain;
  quality: number; status: "ACTIVE" | "LOCKED" | "RECOVERING" | "COMPROMISED" | "LOST" | "EXTRACTED";
  compromised: boolean; exposed: boolean; created_world_date: string; recover_after_world_date: string | null;
};

export type SpyOperation = {
  id: string; definition_key: string; observer_country_id: string; target_country_id: string;
  state: string; current_phase: IntelligencePhase; started_world_date: string; phase_end_world_date: string | null;
  success_result: "SUCCESS" | "FAILURE" | null; detection_result: "DETECTED" | "UNDETECTED" | null;
  attribution_result: "UNATTRIBUTED" | "SUSPECTED" | "ATTRIBUTED" | null;
  admin_review_status: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
};

export type IntelligenceSnapshot = {
  id: string; observer_country_id: string; target_country_id: string; domain: IntelligenceDomain;
  acquired_world_date: string; confidence: IntelligenceConfidence; expires_world_date: string;
  payload: Record<string, unknown>; source_operation_id: string | null; status: "CURRENT" | "AGING" | "STALE" | "RETRACTED";
};

export type CountryIntelligenceUpgrade = { upgrade_key: string; status: "BUILDING" | "ACTIVE" | "CANCELLED"; started_world_date: string; complete_world_date: string | null };

export type IntelligenceOverview = {
  worldDate: string; actorCountryKey: string; agency: IntelligenceAgency | null;
  upgrades: CountryIntelligenceUpgrade[]; upgradeDefinitions: IntelligenceUpgradeDefinition[];
  operationDefinitions: SpyOperationDefinition[]; networks: SpyNetwork[]; assets: SpyAsset[];
  operations: SpyOperation[]; snapshots: IntelligenceSnapshot[];
  detectedIncidents?: Array<Pick<SpyOperation, "id" | "definition_key" | "target_country_id" | "state" | "detection_result" | "attribution_result" | "started_world_date"> & { observer_country_id: string | null }>;
};

export type IntelligenceAdminData = IntelligenceOverview & {
  actorCountryKey: "ADMIN"; agencies: IntelligenceAgency[]; auditLogs: Array<Record<string, unknown>>;
  eventCandidates: Array<Record<string, unknown>>;
};
