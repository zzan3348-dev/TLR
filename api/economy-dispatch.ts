import type { ApiRequest, ApiResponse } from "../server/types.js";
import budget from "../server/routes/economy/budget.js";
import current from "../server/routes/economy/current.js";
import researchInvestments from "../server/routes/research/investments.js";
import researchOverview from "../server/routes/research/overview.js";
import researchProjects from "../server/routes/research/projects.js";
import naviAdminResearch from "../server/routes/navi/adminResearch.js";
import naviDecisions from "../server/routes/navi/decisions.js";
import naviEconomy from "../server/routes/navi/economy.js";
import naviEvents from "../server/routes/navi/events.js";
import naviMe from "../server/routes/navi/me.js";
import naviResearch from "../server/routes/navi/research.js";
import naviResearchInvestments from "../server/routes/navi/researchInvestments.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  budget,
  current,
};

const researchHandlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  overview: researchOverview,
  projects: researchProjects,
  investments: researchInvestments,
};

const naviHandlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  me: naviMe,
  research: naviResearch,
  "research-investments": naviResearchInvestments,
  "admin-research": naviAdminResearch,
  economy: naviEconomy,
  decisions: naviDecisions,
  events: naviEvents,
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawRoute = request.query?.route;
  const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
  const rawDomain = request.query?.domain;
  const domain = Array.isArray(rawDomain) ? rawDomain[0] : rawDomain;
  const routeHandler = route
    ? domain === "navi"
      ? naviHandlers[route]
      : domain === "research"
        ? researchHandlers[route]
        : handlers[route]
    : undefined;
  if (!routeHandler) {
    response.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await routeHandler(request, response);
}
