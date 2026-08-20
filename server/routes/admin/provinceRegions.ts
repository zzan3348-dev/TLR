import type { ApiRequest, ApiResponse } from "../../types.js";
import { requireAdminSession } from "../../adminAuth.js";
import { getAdminClient, getServerEnv } from "../../auth.js";

type RegionBody = {
  id?: unknown;
  name?: unknown;
  provinceIds?: unknown;
};

const validRegionId = (value: string) => /^[a-z0-9][a-z0-9_-]{1,63}$/u.test(value);
const validProvinceId = (value: string) => /^country-\d{3}-p-[a-z0-9-]+$/u.test(value);

export default async function provinceRegionsAdmin(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  if (!requireAdminSession(request, response)) return;
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "PROVINCE_REGIONS_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  if (request.method === "GET") {
    const { data, error } = await admin.from("province_regions").select("id,name,province_ids").order("name");
    if (error) {
      response.status(500).json({ error: "PROVINCE_REGIONS_READ_FAILED" });
      return;
    }
    response.status(200).json({
      regions: (data ?? []).map((row) => ({ id: row.id, name: row.name, provinceIds: row.province_ids ?? [] })),
    });
    return;
  }

  const body = (request.body ?? {}) as RegionBody;
  const id = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
  if (!validRegionId(id)) {
    response.status(400).json({ error: "INVALID_REGION_ID" });
    return;
  }
  if (request.method === "DELETE") {
    const { error } = await admin.from("province_regions").delete().eq("id", id);
    response.status(error ? 500 : 200).json(error ? { error: "PROVINCE_REGION_DELETE_FAILED" } : { ok: true });
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const provinceIds = Array.isArray(body.provinceIds)
    ? [...new Set(body.provinceIds.filter((value): value is string => typeof value === "string" && validProvinceId(value)))].sort()
    : [];
  if (!name || provinceIds.length === 0 || provinceIds.length > 6000) {
    response.status(400).json({ error: "INVALID_PROVINCE_REGION" });
    return;
  }
  const { error } = await admin.from("province_regions").upsert({
    id,
    name,
    province_ids: provinceIds,
    updated_at: new Date().toISOString(),
  });
  response.status(error ? 500 : 200).json(error ? { error: "PROVINCE_REGION_SAVE_FAILED" } : { ok: true });
}
