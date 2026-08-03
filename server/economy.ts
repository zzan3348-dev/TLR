import type { AdminClient } from "./auth.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import { cleanCountryKey, currentWorldDate, requireDiplomacyActor, reviewRouteForCountry } from "./diplomacy.js";

export const TRADE_ASSETS = ["RESOURCE", "PRODUCTION_CAPACITY"] as const;
export const TRADE_RESOURCES = ["STEEL", "OIL", "COAL", "FOOD", "RARE_MINERALS"] as const;
export type TradeAsset = (typeof TRADE_ASSETS)[number];
export type TradeResource = (typeof TRADE_RESOURCES)[number];

export type EconomyActor = Awaited<ReturnType<typeof requireDiplomacyActor>>;

export async function requireEconomyActor(request: ApiRequest, response: ApiResponse, admin: AdminClient) {
  return requireDiplomacyActor(request, response, admin);
}

export async function economyWorldDate(admin: AdminClient): Promise<string> {
  const date = await currentWorldDate(admin);
  const { error } = await admin.rpc("tlr_refresh_trade_state", { p_world_date: date });
  if (error) throw error;
  return date;
}

export function cleanTradeAsset(value: unknown): TradeAsset | null {
  return typeof value === "string" && (TRADE_ASSETS as readonly string[]).includes(value)
    ? value as TradeAsset : null;
}

export function cleanTradeResource(value: unknown): TradeResource | null {
  return typeof value === "string" && (TRADE_RESOURCES as readonly string[]).includes(value)
    ? value as TradeResource : null;
}

export function cleanPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1_000_000
    ? value : null;
}

export function cleanBudget(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows = Object.entries(value);
  if (rows.length === 0 || rows.length > 20) return null;
  const result: Record<string, number> = {};
  for (const [key, amount] of rows) {
    if (!/^[a-z][a-z0-9_]{0,39}$/u.test(key) || typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > 100) return null;
    result[key] = amount;
  }
  return result;
}

export type TradeLineInput = {
  fromCountryKey: string;
  toCountryKey: string;
  assetType: TradeAsset;
  resourceTypeId: TradeResource | null;
  amount: number;
};

export function cleanTradeLines(value: unknown, proposer: string, receiver: string): TradeLineInput[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) return null;
  const parties = new Set([proposer, receiver]);
  const result: TradeLineInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const input = row as Record<string, unknown>;
    const fromCountryKey = cleanCountryKey(input.fromCountryKey);
    const toCountryKey = cleanCountryKey(input.toCountryKey);
    const assetType = cleanTradeAsset(input.assetType);
    const resourceTypeId = input.resourceTypeId == null ? null : cleanTradeResource(input.resourceTypeId);
    const amount = cleanPositiveNumber(input.amount);
    if (!fromCountryKey || !toCountryKey || !assetType || !amount || fromCountryKey === toCountryKey
      || !parties.has(fromCountryKey) || !parties.has(toCountryKey)
      || (assetType === "RESOURCE" && !resourceTypeId)
      || (assetType === "PRODUCTION_CAPACITY" && resourceTypeId !== null)) return null;
    result.push({ fromCountryKey, toCountryKey, assetType, resourceTypeId, amount });
  }
  if (!result.some((line) => line.fromCountryKey === proposer) || !result.some((line) => line.fromCountryKey === receiver)) return null;
  return result;
}

export async function tradeReviewRoute(admin: AdminClient, target: string) {
  return reviewRouteForCountry(admin, target);
}

export function economyDatabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "DATABASE_ERROR";
  const known = [
    "SELF_TRADE", "INVALID_REVIEW_ROUTE", "INVALID_TRADE_DATES", "TRADE_LINES_REQUIRED",
    "INVALID_TRADE_LINE_COUNTRY", "INVALID_TRADE_AMOUNT", "INVALID_TRADE_ASSET", "BILATERAL_TRADE_REQUIRED",
    "ECONOMY_NOT_TRADE_READY", "TRADE_RESTRICTED", "TRADE_ASSET_INSUFFICIENT", "TRADE_ASSET_UNCONFIGURED",
    "PRODUCTION_CAPACITY_UNCONFIGURED", "RESOURCE_UNCONFIGURED", "DUPLICATE_PENDING_TRADE",
    "TRADE_PROPOSAL_NOT_FOUND", "TRADE_PROPOSAL_NOT_PENDING", "TRADE_PROPOSAL_EXPIRED",
    "NOT_TRADE_RECEIVER", "NOT_TRADE_PARTY", "TRADE_AGREEMENT_NOT_FOUND", "TRADE_AGREEMENT_CLOSED",
    "EARLY_TERMINATION_NOT_ALLOWED", "INVALID_BUDGET", "INVALID_ECONOMY_PERIOD", "ECONOMY_UNCONFIGURED", "BUDGET_DRAFT_REQUIRED",
  ];
  return known.find((code) => message.includes(code)) ?? "DATABASE_ERROR";
}
