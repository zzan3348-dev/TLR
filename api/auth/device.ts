import type { ApiRequest, ApiResponse } from "../../server/types";
import { ensureDeviceCookie } from "../../server/auth";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  const device = ensureDeviceCookie(request);
  if (device.setCookie) response.setHeader("Set-Cookie", device.setCookie);
  response.status(200).json({ ok: true });
}
