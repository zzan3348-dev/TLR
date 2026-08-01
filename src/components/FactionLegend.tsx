import {
  factions,
  NON_ALIGNED_COLOR,
} from "../data/factions";

export function FactionLegend() {
  return (
    <aside className="faction-legend" aria-label="세력지도 범례">
      <header>
        <strong>국제 세력</strong>
        <small>FACTION MAP</small>
      </header>
      <ul>
        {factions.map((faction) => (
          <li key={faction.id}>
            <i style={{ backgroundColor: faction.color }} />
            <span>{faction.name}</span>
          </li>
        ))}
        <li>
          <i style={{ backgroundColor: NON_ALIGNED_COLOR }} />
          <span>비동맹</span>
        </li>
      </ul>
    </aside>
  );
}
