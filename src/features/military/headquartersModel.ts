import type { ForceKind, MilitaryCreationQueue, MilitaryOverview } from "./types";

export function militaryNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "미설정" : value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

export function productionProgress(queue: MilitaryCreationQueue, worldDate: string): number | null {
  if (queue.status === "COMPLETED") return 100;
  const start = Date.parse(`${queue.requested_world_date}T00:00:00Z`);
  const end = Date.parse(`${queue.completion_world_date}T00:00:00Z`);
  const now = Date.parse(`${worldDate}T00:00:00Z`);
  if (![start, end, now].every(Number.isFinite) || end < start) return null;
  return end === start ? (now >= end ? 100 : 0) : Math.max(0, Math.min(100, (now - start) / (end - start) * 100));
}

export function serviceForces(data: MilitaryOverview, kind: ForceKind) {
  const templates = new Map(data.templates.map((row) => [row.id, row]));
  if (kind === "LAND_UNIT") return data.units.map((unit) => ({ id: unit.id, name: unit.display_name, status: unit.status, templateName: templates.get(unit.template_id)?.display_name ?? "편제 미설정", personnel: unit.current_manpower, maximum: unit.max_manpower, readiness: unit.equipment_readiness, training: unit.training_level, frontId: unit.assigned_front_id, fleetId: null }));
  if (kind === "AIR_WING") return data.airWings.map((wing) => ({ id: wing.id, name: wing.display_name, status: wing.status, templateName: templates.get(wing.template_id)?.display_name ?? "편제 미설정", personnel: wing.current_personnel, maximum: wing.max_personnel, readiness: wing.readiness, training: wing.training_level, frontId: wing.assigned_front_id, fleetId: null }));
  return data.vessels.map((ship) => ({ id: ship.id, name: ship.display_name, status: ship.status, templateName: templates.get(ship.template_id)?.display_name ?? "함급 미설정", personnel: null, maximum: templates.get(ship.template_id)?.crew_required ?? null, readiness: null, training: null, frontId: ship.assigned_front_id, fleetId: ship.fleet_id }));
}
