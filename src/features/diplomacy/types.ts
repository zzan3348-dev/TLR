export type ProposalType =
  | "NON_AGGRESSION"
  | "TRADE_AGREEMENT"
  | "FACTION_INVITATION"
  | "MILITARY_ACCESS"
  | "INDEPENDENCE_GUARANTEE";

export type ProposalStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "CANCELLED";

export type RelationModifier = {
  id: number;
  modifier_type: string;
  value: number;
  title: string;
  starts_world_date: string | null;
  ends_world_date: string | null;
  source_reference: string | null;
};

export type DirectionalRelation = {
  available: boolean;
  baseScore: number | null;
  score: number | null;
  modifiers: RelationModifier[];
};

export type DiplomaticProposal = {
  id: string;
  proposer_country_key: string;
  receiver_country_key: string;
  proposal_type: ProposalType;
  status: ProposalStatus;
  review_route: "PLAYER" | "ADMIN";
  terms: Record<string, unknown>;
  proposed_start_world_date: string;
  proposed_end_world_date: string | null;
  response_deadline_world_date: string;
  sent_world_date: string;
  responded_world_date: string | null;
  created_at: string;
  updated_at: string;
};

export type DiplomaticAgreement = {
  id: string;
  country_a_key: string;
  country_b_key: string;
  agreement_type: ProposalType | "FACTION_MEMBERSHIP";
  status: "SCHEDULED" | "ACTIVE" | "EXPIRED" | "TERMINATED" | "CANCELLED";
  starts_world_date: string;
  ends_world_date: string | null;
  terms: Record<string, unknown>;
  created_from_proposal_id: string | null;
};

export type RelationHistory = {
  id: number;
  previous_score: number;
  change_amount: number;
  next_score: number;
  reason: string;
  source_type: string;
  world_date: string;
  created_at: string;
};

export type ActionAvailability = { available: boolean; reason: string | null };

export type DiplomacyOverview = {
  actorCountryKey: string;
  targetCountryKey: string;
  worldDate: string;
  targetReviewRoute: "PLAYER" | "ADMIN";
  relations: { outgoing: DirectionalRelation; incoming: DirectionalRelation };
  actions: Record<string, ActionAvailability>;
  proposals: DiplomaticProposal[];
  agreements: DiplomaticAgreement[];
  history: RelationHistory[];
};

export type DiplomacyNotification = {
  id: string;
  recipient_country_key: string;
  counterpart_country_key: string;
  notification_type: string;
  proposal_id: string | null;
  agreement_id: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  proposal: DiplomaticProposal | null;
};

export const PROPOSAL_LABELS: Record<ProposalType, string> = {
  NON_AGGRESSION: "불가침 조약",
  TRADE_AGREEMENT: "무역 협정",
  FACTION_INVITATION: "세력 가입 초청",
  MILITARY_ACCESS: "군사 통행권",
  INDEPENDENCE_GUARANTEE: "독립 보장",
};

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  PENDING: "응답 대기",
  ACCEPTED: "수락",
  REJECTED: "거절",
  WITHDRAWN: "철회",
  EXPIRED: "기한 만료",
  CANCELLED: "취소",
};
