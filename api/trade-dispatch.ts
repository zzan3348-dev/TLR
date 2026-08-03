import type { ApiRequest, ApiResponse } from "../server/types.js";
import agreements from "../server/routes/trade/agreements.js";
import countries from "../server/routes/trade/countries.js";
import notifications from "../server/routes/trade/notifications.js";
import proposals from "../server/routes/trade/proposals.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  agreements,
  countries,
  notifications,
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
