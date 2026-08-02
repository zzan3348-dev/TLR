import type { ApiRequest, ApiResponse } from "../../server/types";
import {
  adminSessionCookie,
  clearBootstrapFailures,
  createAdminSession,
  getAdminConfig,
  isRateLimited,
  recordBootstrapFailure,
  verifyBootstrapSecret,
} from "../../server/adminAuth";

type BootstrapBody = { code?: unknown };

export default function handler(request: ApiRequest, response: ApiResponse): void {
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const config = getAdminConfig();
  if (!config.bootstrapEnabled || !config.bootstrapSecretHash || !config.sessionSecret) {
    response.status(503).json({ error: "BOOTSTRAP_UNAVAILABLE" });
    return;
  }
  if (isRateLimited(request)) {
    response.status(429).json({ error: "인증 코드가 올바르지 않습니다" });
    return;
  }
  const body = (request.body ?? {}) as BootstrapBody;
  const code = typeof body.code === "string" ? body.code : "";
  if (!code || code.length > 128 || !verifyBootstrapSecret(code, config.bootstrapSecretHash)) {
    recordBootstrapFailure(request);
    response.status(401).json({ error: "인증 코드가 올바르지 않습니다" });
    return;
  }
  clearBootstrapFailures(request);
  const token = createAdminSession("superadmin", "bootstrap", config.sessionSecret);
  response.setHeader("Set-Cookie", adminSessionCookie(token));
  response.status(200).json({ ok: true });
}
