import type { ApiRequest, ApiResponse } from "../server/types.js";
import actions from "../server/routes/diplomacy/actions.js";
import notifications from "../server/routes/diplomacy/notifications.js";
import overview from "../server/routes/diplomacy/overview.js";
import proposals from "../server/routes/diplomacy/proposals.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  actions,
  notifications,
  overview,
  proposals,
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawRoute = request.query?.route;
  const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
  const routeHandler = route ? handlers[route] : undefined;
  if (!routeHandler) {
    response.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await routeHandler(request, response);
}
