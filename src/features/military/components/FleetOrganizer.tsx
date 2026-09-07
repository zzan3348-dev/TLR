import { useState } from "react";
import { militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import type { MilitaryOverview } from "../types";

export function FleetOrganizer({ data, reload }: { data: MilitaryOverview; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutate = async (body: Record<string, unknown>, method: "POST" | "PATCH") => {
    if (pending) return;
    setPending(true); setError(null);
    try { await militaryMutation(MILITARY_ROUTES.forces, body, method); setSelected([]); await reload(); }
    catch { setError("함대 조직을 변경하지 못했습니다."); }
    finally { setPending(false); }
  };
  return <details className="hq-panel"><summary>함대 조직 · 함선 이동</summary>{error && <p role="alert">{error}</p>}
    <form className="hq-edit" onSubmit={(event) => { event.preventDefault(); void mutate({ action: "CREATE_FLEET", display_name: new FormData(event.currentTarget).get("name") }, "POST"); }}><label>새 함대 이름<input name="name" required maxLength={80} /></label><button disabled={pending}>함대 생성</button></form>
    <div className="hq-two-columns">{[{ id: "", display_name: "미배속 함선" }, ...data.fleets].map((fleet) => <section key={fleet.id}><h4>{fleet.display_name}</h4>{data.vessels.filter((ship) => (ship.fleet_id ?? "") === fleet.id && !["SUNK", "RETIRED"].includes(ship.status)).map((ship) => <label className="hq-row" key={ship.id}><input type="checkbox" checked={selected.includes(ship.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, ship.id] : current.filter((id) => id !== ship.id))} />{ship.display_name}</label>)}</section>)}</div>
    <label>이동할 함대 <select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">미배속으로 이동</option>{data.fleets.map((fleet) => <option value={fleet.id} key={fleet.id}>{fleet.display_name}</option>)}</select></label> <button disabled={pending || !selected.length} onClick={() => void mutate({ action: "MOVE_VESSELS", vessel_ids: selected, fleet_id: target || null }, "PATCH")}>{selected.length}척 이동</button>
  </details>;
}
