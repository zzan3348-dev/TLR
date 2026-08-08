import type { ApiRequest, ApiResponse } from "../server/types.js";
import overview from "../server/routes/military/overview.js";
import officerCorps from "../server/routes/military/officer-corps.js";
import conflicts from "../server/routes/military/conflicts.js";
import fronts from "../server/routes/military/fronts.js";
import reports from "../server/routes/military/reports.js";
import forces from "../server/routes/military/forces.js";
import actions from "../server/routes/military/actions.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = {
  overview, "officer-corps": officerCorps, conflicts, fronts, reports, forces, actions,
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const raw = request.query?.route;
  const route = Array.isArray(raw) ? raw[0] : raw;
  const routeHandler = route ? handlers[route] : undefined;
  if (!routeHandler) { response.status(404).json({ error: "NOT_FOUND" }); return; }
  await routeHandler(request, response);
}
