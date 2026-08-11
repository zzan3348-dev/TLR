import type { ApiRequest, ApiResponse } from "../server/types.js";
import adminResearch from "../server/routes/navi/adminResearch.js";
import decisions from "../server/routes/navi/decisions.js";
import economy from "../server/routes/navi/economy.js";
import events from "../server/routes/navi/events.js";
import me from "../server/routes/navi/me.js";
import research from "../server/routes/navi/research.js";
import researchInvestments from "../server/routes/navi/researchInvestments.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  me,
  research,
  "research-investments": researchInvestments,
  "admin-research": adminResearch,
  economy,
  decisions,
  events,
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
