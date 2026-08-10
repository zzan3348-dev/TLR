import type { ApiRequest, ApiResponse } from "../server/types.js";
import investments from "../server/routes/research/investments.js";
import overview from "../server/routes/research/overview.js";
import projects from "../server/routes/research/projects.js";

const handlers: Record<string, (request: ApiRequest, response: ApiResponse) => Promise<void>> = { overview, projects, investments };
export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const raw = request.query?.route; const route = Array.isArray(raw) ? raw[0] : raw;
  const selected = route ? handlers[route] : undefined;
  if (!selected) { response.status(404).json({ error: "NOT_FOUND" }); return; }
  await selected(request,response);
}
