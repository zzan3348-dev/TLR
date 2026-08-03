import type { ApiRequest, ApiResponse } from "./types.js";
import { getAuthenticatedUser, type AdminClient } from "./auth.js";

export type ActiveProfile = {
  id: string;
  access_status: "active" | "review" | "blocked";
};

/** Shared guard for every future game-mutating API route. */
export async function requireActiveUser(
  request: ApiRequest,
  response: ApiResponse,
  admin: AdminClient,
): Promise<{ userId: string; profile: ActiveProfile } | null> {
  const user = await getAuthenticatedUser(request, admin);
  if (!user) {
    response.status(401).json({ error: "UNAUTHORIZED" });
    return null;
  }
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, access_status")
    .eq("id", user.id)
    .maybeSingle<ActiveProfile>();
  if (error || !profile) {
    response.status(403).json({ error: "PROFILE_REQUIRED" });
    return null;
  }
  if (profile.access_status !== "active") {
    response.status(403).json({ error: "PLAY_ACCESS_BLOCKED", accessStatus: profile.access_status });
    return null;
  }
  return { userId: user.id, profile };
}
