import type { ApiRequest, ApiResponse } from "../server/types.js";
import { getAdminClient, getServerEnv } from "../server/auth.js";

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const env = getServerEnv();
  if (!env) {
    response.status(200).json({ capitals: [] });
    return;
  }
  const { data, error } = await getAdminClient(env)
    .from("map_capitals")
    .select("country_key,name,map_x,map_y,enabled")
    .order("country_key");
  if (error) {
    response.status(200).json({ capitals: [] });
    return;
  }
  response.status(200).json({
    capitals: (data ?? []).map((row) => ({
      countryKey: row.country_key,
      name: row.name,
      x: row.map_x,
      y: row.map_y,
      enabled: row.enabled,
    })),
  });
}
