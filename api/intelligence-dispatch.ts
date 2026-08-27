import type { ApiRequest, ApiResponse } from "../server/types.js";
import overview from "../server/routes/intelligence/overview.js";
import actions from "../server/routes/intelligence/actions.js";
const handlers = { overview, actions } as const;
export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const value = request.query?.route; const route = Array.isArray(value) ? value[0] : value;
  const routeHandler = route && route in handlers ? handlers[route as keyof typeof handlers] : null;
  if (!routeHandler) { response.status(404).json({ error: "NOT_FOUND" }); return; } await routeHandler(request, response);
}
