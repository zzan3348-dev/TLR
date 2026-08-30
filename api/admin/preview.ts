import { requireAdminSession, getAdminConfig } from "../../server/adminAuth.js";
import { adminPreviewCookie, clearAdminPreviewCookie, createAdminPreviewSession, getAdminPreview } from "../../server/adminPreview.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import type { ApiRequest, ApiResponse } from "../../server/types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response);
  if (!session) return;
  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", clearAdminPreviewCookie());
    response.status(200).json({ ok: true });
    return;
  }
  if (request.method === "GET") {
    const preview = getAdminPreview(request);
    response.status(200).json({ active: Boolean(preview), countryKey: preview?.countryKey ?? null, readOnly: true });
    return;
  }
  if (request.method !== "POST") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const countryKey = typeof (request.body as { countryKey?: unknown } | null)?.countryKey === "string"
    ? (request.body as { countryKey: string }).countryKey : "";
  if (!/^country-\d{3}$/u.test(countryKey)) return void response.status(400).json({ error: "INVALID_PREVIEW_COUNTRY" });
  const env = getServerEnv();
  const secret = getAdminConfig().sessionSecret;
  if (!env || !secret) return void response.status(503).json({ error: "PREVIEW_NOT_CONFIGURED" });
  const admin = getAdminClient(env);
  const country = await admin.from("countries").select("country_key").eq("country_key", countryKey).eq("active", true).maybeSingle<{ country_key: string }>();
  if (country.error || !country.data) return void response.status(404).json({ error: "COUNTRY_NOT_FOUND" });
  response.setHeader("Set-Cookie", adminPreviewCookie(createAdminPreviewSession(countryKey, secret)));
  response.status(200).json({ ok: true, countryKey, readOnly: true, adminRole: session.role });
}
