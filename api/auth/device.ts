import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { ensureDeviceCookie } from "../../server/auth.js";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  const device = ensureDeviceCookie(request);
  if (device.setCookie) response.setHeader("Set-Cookie", device.setCookie);
  response.status(200).json({ ok: true });
}
