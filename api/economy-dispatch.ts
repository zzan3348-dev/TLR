import type { ApiRequest, ApiResponse } from "../server/types.js";
import budget from "../server/routes/economy/budget.js";
import current from "../server/routes/economy/current.js";
import researchInvestments from "../server/routes/research/investments.js";
import researchOverview from "../server/routes/research/overview.js";
import researchProjects from "../server/routes/research/projects.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  budget,
  current,
};

const researchHandlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  overview: researchOverview,
  projects: researchProjects,
  investments: researchInvestments,
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawRoute = request.query?.route;
  const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
  const rawDomain = request.query?.domain;
  const domain = Array.isArray(rawDomain) ? rawDomain[0] : rawDomain;
  const routeHandler = route
    ? domain === "research"
      ? researchHandlers[route]
      : handlers[route]
    : undefined;
  if (!routeHandler) {
    response.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await routeHandler(request, response);
}
