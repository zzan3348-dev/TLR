import { clearAuthSessionCookie } from "../../server/persistentSession.js";
import type { ApiRequest, ApiResponse } from "../../server/types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  response.setHeader("Set-Cookie", clearAuthSessionCookie());
  response.status(200).json({ ok: true });
}
