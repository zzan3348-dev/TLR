import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { requireAdminSession } from "../../server/adminAuth.js";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const session = requireAdminSession(request, response);
  if (!session) return;
  response.status(200).json({ ok: true, role: session.role, kind: session.kind, expiresAt: session.exp * 1000 });
}
