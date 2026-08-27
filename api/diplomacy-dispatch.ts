import type { ApiRequest, ApiResponse } from "../server/types.js";
import actions from "../server/routes/diplomacy/actions.js";
import notifications from "../server/routes/diplomacy/notifications.js";
import overview from "../server/routes/diplomacy/overview.js";
import proposals from "../server/routes/diplomacy/proposals.js";
import intelligenceActions from "../server/routes/intelligence/actions.js";
import intelligenceOverview from "../server/routes/intelligence/overview.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  actions,
  notifications,
  overview,
  proposals,
};

const intelligenceHandlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  actions: intelligenceActions,
  overview: intelligenceOverview,
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawRoute = request.query?.route;
  const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
  const rawDomain = request.query?.domain;
  const domain = Array.isArray(rawDomain) ? rawDomain[0] : rawDomain;
  const routeHandler = route ? domain === "intelligence" ? intelligenceHandlers[route] : handlers[route] : undefined;
  if (!routeHandler) {
    response.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await routeHandler(request, response);
}
