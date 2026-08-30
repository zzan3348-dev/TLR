/// <reference types="node" />
import type { ApiRequest, ApiResponse } from "./types.js";
import { requireActiveUser } from "./access.js";
import type { AdminClient } from "./auth.js";
import { getAdminPreview } from "./adminPreview.js";

export const PROPOSAL_TYPES = [
  "NON_AGGRESSION",
  "TRADE_AGREEMENT",
  "FACTION_INVITATION",
  "MILITARY_ACCESS",
  "INDEPENDENCE_GUARANTEE",
] as const;

export type ProposalType = (typeof PROPOSAL_TYPES)[number];
export type ProposalStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "CANCELLED";
export type ReviewRoute = "PLAYER" | "ADMIN";

export type DiplomacyActor = {
  userId: string | null;
  countryKey: string;
  mode: "authenticated" | "development" | "preview";
};

type OwnershipRow = {
  country_key: string;
  user_id: string;
  status: "active" | "revoked";
};

type AdminActionRow = {
  action_kind: "REVOKE_COUNTRY_OWNERSHIP" | "DENY_COUNTRY_ACCESS" | "SUSPEND_ALL_PLAY" | "BLOCK_ACCOUNT";
  target_user_id: string | null;
  target_country_key: string | null;
};

export type ProposalRow = {
  id: string;
  proposer_country_key: string;
  receiver_country_key: string;
  proposal_type: ProposalType;
  status: ProposalStatus;
  review_route: ReviewRoute;
  terms: Record<string, unknown>;
  sent_world_date: string;
  proposed_start_world_date: string;
  proposed_end_world_date: string | null;
  response_deadline_world_date: string;
  responded_world_date: string | null;
  created_at: string;
  updated_at: string;
};

export type AgreementRow = {
  id: string;
  created_from_proposal_id: string | null;
  agreement_type: ProposalType | "FACTION_MEMBERSHIP";
  country_a_key: string;
  country_b_key: string;
  terms: Record<string, unknown>;
  status: "SCHEDULED" | "ACTIVE" | "EXPIRED" | "TERMINATED" | "CANCELLED";
  starts_world_date: string;
  ends_world_date: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_country_key: string;
  counterpart_country_key: string;
  notification_type: string;
  proposal_id: string | null;
  agreement_id: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

function oneHeader(request: ApiRequest, name: string): string | null {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

function isDevelopmentRequest(request: ApiRequest): string | null {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return null;
  if (process.env.DIPLOMACY_DEV_MODE !== "true") return null;
  const expected = process.env.DIPLOMACY_DEV_TOKEN;
  const provided = oneHeader(request, "x-tlr-dev-token");
  const country = oneHeader(request, "x-tlr-dev-country");
  return expected && provided === expected && country?.startsWith("country-") ? country : null;
}

export async function currentWorldDate(admin: AdminClient): Promise<string> {
  const { data, error } = await admin
    .from("world_state")
    .select("current_world_date")
    .eq("singleton", true)
    .single<{ current_world_date: string }>();
  if (error || !data) throw new Error("WORLD_STATE_UNAVAILABLE");
  await Promise.all([
    admin.rpc("tlr_expire_diplomacy", { p_world_date: data.current_world_date }),
    admin.rpc("tlr_advance_intelligence", { p_world_date: data.current_world_date }),
    admin.rpc("tlr_advance_country_stats", { p_world_date: data.current_world_date }),
  ]);
  return data.current_world_date;
}

async function activeAdminRestrictions(
  admin: AdminClient,
  userId: string,
  countryKey: string,
): Promise<AdminActionRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("admin_action_logs")
    .select("action_kind, target_user_id, target_country_key")
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .or(`target_user_id.eq.${userId},target_country_key.eq.${countryKey},action_kind.eq.SUSPEND_ALL_PLAY`)
    .returns<AdminActionRow[]>();
  if (error) throw new Error("ACCESS_STATE_UNAVAILABLE");
  return data ?? [];
}

export async function requireDiplomacyActor(
  request: ApiRequest,
  response: ApiResponse,
  admin: AdminClient,
): Promise<DiplomacyActor | null> {
  const devCountry = isDevelopmentRequest(request);
  if (devCountry) return { userId: null, countryKey: devCountry, mode: "development" };

  const preview = getAdminPreview(request);
  if (preview) {
    if (request.method !== "GET") {
      response.status(403).json({ error: "ADMIN_PREVIEW_READ_ONLY" });
      return null;
    }
    return { userId: null, countryKey: preview.countryKey, mode: "preview" };
  }

  const auth = await requireActiveUser(request, response, admin);
  if (!auth) return null;
  const { data: ownership, error } = await admin
    .from("country_ownerships")
    .select("country_key, user_id, status")
    .eq("user_id", auth.userId)
    .eq("status", "active")
    .maybeSingle<OwnershipRow>();
  if (error) {
    response.status(503).json({ error: "OWNERSHIP_STATE_UNAVAILABLE" });
    return null;
  }
  if (!ownership) {
    response.status(403).json({ error: "COUNTRY_OWNERSHIP_REQUIRED" });
    return null;
  }
  const restrictions = await activeAdminRestrictions(admin, auth.userId, ownership.country_key);
  if (restrictions.some((row) => row.action_kind === "BLOCK_ACCOUNT" || row.action_kind === "SUSPEND_ALL_PLAY")) {
    response.status(403).json({ error: "PLAY_ACCESS_BLOCKED" });
    return null;
  }
  if (restrictions.some((row) => row.action_kind === "REVOKE_COUNTRY_OWNERSHIP")) {
    response.status(409).json({ error: "COUNTRY_OWNERSHIP_REVOKED" });
    return null;
  }
  if (
    restrictions.some(
      (row) =>
        row.action_kind === "DENY_COUNTRY_ACCESS" &&
        row.target_country_key === ownership.country_key,
    )
  ) {
    response.status(403).json({ error: "COUNTRY_ACCESS_DENIED" });
    return null;
  }
  return { userId: auth.userId, countryKey: ownership.country_key, mode: "authenticated" };
}

export async function reviewRouteForCountry(admin: AdminClient, countryKey: string): Promise<ReviewRoute> {
  const { data, error } = await admin
    .from("country_ownerships")
    .select("country_key")
    .eq("country_key", countryKey)
    .eq("status", "active")
    .maybeSingle<{ country_key: string }>();
  if (error) throw new Error("OWNERSHIP_STATE_UNAVAILABLE");
  return data ? "PLAYER" : "ADMIN";
}

export function proposalType(value: unknown): ProposalType | null {
  return typeof value === "string" && (PROPOSAL_TYPES as readonly string[]).includes(value)
    ? value as ProposalType
    : null;
}

export function cleanCountryKey(value: unknown): string | null {
  return typeof value === "string" && /^country-\d{3}$/u.test(value) ? value : null;
}

export function cleanDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

export function cleanTerms(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20));
}

export function databaseErrorCode(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "DATABASE_ERROR";
  const known = [
    "SELF_TARGET", "DUPLICATE_PENDING_PROPOSAL", "AGREEMENT_EXISTS", "INVALID_DEADLINE",
    "INVALID_START_DATE", "INVALID_END_DATE",
    "PROPOSAL_NOT_FOUND", "PROPOSAL_NOT_PENDING", "PROPOSAL_EXPIRED", "NOT_PROPOSAL_RECEIVER",
    "NOT_PROPOSAL_PROPOSER", "ACTION_COOLDOWN", "UNKNOWN_ACTION", "ADMIN_REVIEW_NOT_FOUND",
  ];
  return known.find((code) => message.includes(code)) ?? "DATABASE_ERROR";
}

export async function proposalById(admin: AdminClient, id: string): Promise<ProposalRow | null> {
  const { data, error } = await admin
    .from("diplomatic_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle<ProposalRow>();
  if (error) throw error;
  return data;
}
