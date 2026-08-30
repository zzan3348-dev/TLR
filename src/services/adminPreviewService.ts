export type AdminPreviewState = { active: boolean; countryKey: string | null; readOnly: true };

export async function loadAdminPreview(): Promise<AdminPreviewState> {
  const response = await fetch("/api/admin/preview", { credentials: "include" });
  if (!response.ok) return { active: false, countryKey: null, readOnly: true };
  return await response.json() as AdminPreviewState;
}

export async function endAdminPreview(): Promise<void> {
  await fetch("/api/admin/preview", { method: "DELETE", credentials: "include" });
}
