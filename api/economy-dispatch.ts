import type { ApiRequest, ApiResponse } from "../server/types.js";
import budget from "../server/routes/economy/budget.js";
import current from "../server/routes/economy/current.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  budget,
  current,
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
