import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";

type CapitalBody = {
  countryKey?: unknown;
  name?: unknown;
  x?: unknown;
  y?: unknown;
  enabled?: unknown;
};

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  if (!requireAdminSession(request, response)) return;
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "MAP_CAPITALS_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  if (request.method === "GET") {
    const { data, error } = await admin.from("map_capitals").select("*").order("country_key");
    if (error) {
      response.status(500).json({ error: "MAP_CAPITALS_READ_FAILED" });
      return;
    }
    response.status(200).json({ capitals: data ?? [] });
    return;
  }
  const body = (request.body ?? {}) as CapitalBody;
  const countryKey = typeof body.countryKey === "string" ? body.countryKey.trim() : "";
  if (!/^country-\d{3}$/u.test(countryKey)) {
    response.status(400).json({ error: "INVALID_COUNTRY_KEY" });
    return;
  }
  if (request.method === "DELETE") {
    const { error } = await admin.from("map_capitals").delete().eq("country_key", countryKey);
    response.status(error ? 500 : 200).json(error ? { error: "MAP_CAPITAL_DELETE_FAILED" } : { ok: true });
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const x = typeof body.x === "number" && Number.isFinite(body.x) ? body.x : null;
  const y = typeof body.y === "number" && Number.isFinite(body.y) ? body.y : null;
  if (!name || x === null || y === null || x < 0 || x > 5616 || y < 0 || y > 2160) {
    response.status(400).json({ error: "INVALID_CAPITAL_DATA" });
    return;
  }
  const { error } = await admin.from("map_capitals").upsert({
    country_key: countryKey,
    name,
    map_x: x,
    map_y: y,
    enabled: body.enabled !== false,
    updated_at: new Date().toISOString(),
  });
  response.status(error ? 500 : 200).json(error ? { error: "MAP_CAPITAL_SAVE_FAILED" } : { ok: true });
}
