import type { AdminClient } from "./auth.js";
import type { ApiResponse } from "./types.js";

export type SiteStatus = "pre_open" | "open";
export type SiteStatusRecord = {
  status: SiteStatus;
  openedAt: string | null;
  openedBy: string | null;
};

export async function loadSiteStatus(admin: AdminClient): Promise<SiteStatusRecord> {
  const { data, error } = await admin
    .from("site_config")
    .select("status,opened_at,opened_by")
    .eq("singleton", true)
    .maybeSingle<{ status: SiteStatus; opened_at: string | null; opened_by: string | null }>();
  if (error || !data) {
    console.error("site status unavailable; failing closed as PRE_OPEN", { code: error?.code ?? "NO_ROW" });
    return { status: "pre_open", openedAt: null, openedBy: null };
  }
  return { status: data.status, openedAt: data.opened_at, openedBy: data.opened_by };
}

export async function requireSiteOpen(admin: AdminClient, response: ApiResponse): Promise<boolean> {
  try {
    const site = await loadSiteStatus(admin);
    if (site.status !== "open") {
      response.status(423).json({ error: "SITE_PRE_OPEN", siteStatus: site.status });
      return false;
    }
    return true;
  } catch (error) {
    console.error("site status lookup failed", error);
    response.status(503).json({ error: "SITE_STATUS_UNAVAILABLE" });
    return false;
  }
}
