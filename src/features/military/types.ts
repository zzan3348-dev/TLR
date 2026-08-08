export type ConfigurationStatus = "UNCONFIGURED" | "PARTIAL" | "READY" | "DISABLED";

export type OfficerSpiritCategory = "ACADEMY" | "ARMY" | "DIVISION_COMMAND";
export type MilitarySelectionState =
  | "EMPTY"
  | "READY"
  | "LOCKED"
  | "PARTIAL"
  | "DISABLED"
  | "SELECTED";

export type MilitaryEffect = {
  key: string;
  value: number;
  unit: "flat" | "percent";
  displayText: string;
  adminGuidance?: string;
};

export type RequirementResult = {
  id: string;
  description: string;
  met: boolean;
};

export type OfficerSpirit = {
  id: string;
  key: string;
  category: OfficerSpiritCategory;
  displayName: string;
  description: string;
  iconPath: string | null;
  configurationStatus: Exclude<ConfigurationStatus, "UNCONFIGURED">;
  enabled: boolean;
  selectionState: MilitarySelectionState;
  effects: MilitaryEffect[];
  requirements: RequirementResult[];
};

export type GrandDoctrine = {
  id: string;
  key: string;
  displayName: string;
  description: string;
  iconPath: string | null;
  configurationStatus: Exclude<ConfigurationStatus, "UNCONFIGURED">;
  enabled: boolean;
  selectionState: MilitarySelectionState;
  effects: MilitaryEffect[];
  requirements: RequirementResult[];
};

export type OfficerCorpsState = {
  countryKey: string;
  worldDate: string;
  version: number;
  doctrine: GrandDoctrine | null;
  selectedSpirits: Partial<Record<OfficerSpiritCategory, OfficerSpirit>>;
  doctrines: GrandDoctrine[];
  spirits: OfficerSpirit[];
};

export type ForceKind = "LAND_UNIT" | "VESSEL" | "AIR_WING";
export type FrontKind = "LAND_LINE" | "NAVAL_AREA";
export type ConflictType =
  | "INTERSTATE_WAR"
  | "LIMITED_WAR"
  | "BORDER_CONFLICT"
  | "CIVIL_WAR"
  | "INDEPENDENCE_WAR"
  | "ARMED_UPRISING";
export type ConflictStatus =
  | "DRAFT"
  | "DECLARED"
  | "ACTIVE"
  | "CEASEFIRE"
  | "NEGOTIATING"
  | "ENDED"
  | "CANCELLED";

export type NormalizedPoint = { x: number; y: number };

export type MilitaryTemplate = {
  id: string;
  force_kind: ForceKind;
  display_name: string;
  manpower_required: number | null;
  crew_required: number | null;
  production_capacity_required: number | null;
  formation_days: number | null;
  equipment_requirements: Record<string, number> | null;
  active: boolean;
  configuration_status: ConfigurationStatus;
};

export type LandUnitStatus =
  | "QUEUED" | "FORMING" | "TRAINING" | "ACTIVE" | "RESERVE"
  | "REINFORCING" | "ASSIGNED_TO_FRONT" | "REORGANIZING" | "DISBANDED";

export type LandUnit = {
  id: string;
  country_key: string;
  display_name: string;
  template_id: string;
  current_manpower: number;
  max_manpower: number;
  equipment_readiness: number | null;
  training_level: number | null;
  status: LandUnitStatus;
  assigned_front_id: string | null;
  assigned_conflict_id: string | null;
  created_world_date: string;
  completed_world_date: string | null;
  disbanded_world_date: string | null;
  version: number;
};

export type VesselStatus =
  | "QUEUED" | "UNDER_CONSTRUCTION" | "AWAITING_COMMISSION" | "ACTIVE"
  | "RESERVE" | "DAMAGED" | "UNDER_REPAIR" | "SUNK" | "RETIRED";

export type Vessel = {
  id: string;
  country_key: string;
  display_name: string;
  template_id: string;
  status: VesselStatus;
  fleet_id: string | null;
  assigned_front_id: string | null;
  assigned_conflict_id: string | null;
  laid_down_world_date: string;
  commissioned_world_date: string | null;
  sunk_world_date: string | null;
  version: number;
};

export type Fleet = {
  id: string;
  country_key: string;
  display_name: string;
  status: "ACTIVE" | "RESERVE" | "ASSIGNED_TO_FRONT" | "REORGANIZING" | "DISSOLVED";
  assigned_front_id: string | null;
  assigned_conflict_id: string | null;
  created_world_date: string;
  dissolved_world_date: string | null;
  vessels?: Vessel[];
  version: number;
};

export type AirWing = {
  id: string;
  country_key: string;
  display_name: string;
  template_id: string;
  current_personnel: number;
  max_personnel: number;
  readiness: number | null;
  training_level: number | null;
  status: "FORMING" | "TRAINING" | "ACTIVE" | "RESERVE" | "ASSIGNED" | "REORGANIZING" | "DISBANDED";
  assigned_front_id: string | null;
  assigned_conflict_id: string | null;
  created_world_date: string;
  completed_world_date: string | null;
  disbanded_world_date: string | null;
  version: number;
};

export type ConflictParticipant = {
  id: string;
  conflict_id: string;
  side_id: string;
  country_key: string | null;
  internal_actor_id: string | null;
  role: "BELLIGERENT" | "CO_BELLIGERENT" | "SUPPORTER" | "MEDIATOR";
  joined_world_date: string;
  left_world_date: string | null;
};

export type Conflict = {
  id: string;
  display_name: string;
  conflict_type: ConflictType;
  status: ConflictStatus;
  tags: string[];
  declared_world_date: string | null;
  started_world_date: string | null;
  ended_world_date: string | null;
  sides?: Array<{ id: string; display_name: string; sort_order: number; participants?: ConflictParticipant[] }>;
  version: number;
};

export type MilitaryFront = {
  id: string;
  conflict_id: string;
  front_kind: FrontKind;
  display_name: string;
  owner_side_id: string;
  opponent_side_id: string;
  geometry: NormalizedPoint[];
  status: "DRAFT" | "ACTIVE" | "DISSOLVED";
  version: number;
};

export type MilitaryAction = {
  id: string;
  conflict_id: string;
  country_key: string;
  front_id: string | null;
  title: string;
  body: string;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "CANCELLED";
  submitted_world_date: string | null;
  resolution?: MilitaryActionResolution | null;
  assignments?: Array<{ object_kind: ForceKind | "FLEET"; object_id: string }>;
  version: number;
};

export type MilitaryActionResolution = {
  id: string;
  action_id: string;
  outcome: "SUCCESS" | "PARTIAL" | "FAILURE" | "INVALID" | "WITHDRAWN";
  summary: string;
  losses: Record<string, unknown>;
  state_changes: Record<string, unknown>;
  territory_changes: Record<string, unknown>;
  resolved_world_date: string;
};

export type Occupation = {
  id: string;
  conflict_id: string;
  legal_owner_country_key: string;
  occupier_country_key: string;
  geometry: NormalizedPoint[];
  status: "ACTIVE_OCCUPATION" | "RETURNED" | "ANNEXED" | "TRANSFERRED" | "REMOVED";
  started_world_date: string;
  ended_world_date: string | null;
  version: number;
};

export type WarReport = {
  id: string;
  conflict_id: string;
  title: string;
  body: string;
  report_world_date: string;
  front_id: string | null;
  action_id: string | null;
  winner_side_id: string | null;
  loser_side_id: string | null;
  losses: Record<string, unknown>;
  outcomes: Record<string, unknown>;
  territory_summary: string | null;
  marker: NormalizedPoint | null;
  visibility: "PUBLIC" | "PARTICIPANTS" | "ADMIN_ONLY";
  marker_tone?: "WIN" | "LOSS" | "NEUTRAL";
};

export type MilitaryNotification = {
  id: string;
  country_key: string;
  notification_type: string;
  conflict_id: string | null;
  title: string;
  body: string;
  world_date: string;
  read_at: string | null;
};

export type MilitaryCreationQueue = {
  id: string;
  country_key: string;
  template_id: string;
  force_kind: ForceKind;
  requested_name: string | null;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  manpower_reserved: number;
  production_capacity_reserved: number;
  requested_world_date: string;
  completion_world_date: string;
  version: number;
};

export type MilitaryOverview = {
  countryKey: string;
  worldDate: string;
  readiness: ConfigurationStatus;
  reasons: string[];
  manpower: { available: number | null; reserved: number };
  productionCapacity: { available: number | null; reserved: number };
  templates: MilitaryTemplate[];
  units: LandUnit[];
  vessels: Vessel[];
  fleets: Fleet[];
  airWings: AirWing[];
  queues: MilitaryCreationQueue[];
  conflicts: Conflict[];
};
