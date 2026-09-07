import { readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

// Extract real shared raster edges. Coastlines and ocean pixels never become fronts.
const image = PNG.sync.read(readFileSync(new URL("../public/maps/generated/world-1932-id-map.png", import.meta.url)));
const { width, height, data } = image;
const groups = new Map();
const idAt = (x, y) => { const p = (y * width + x) * 4; return data[p] | data[p + 1] << 8 | data[p + 2] << 16; };
function edge(a, b, x1, y1, x2, y2) {
  if (!a || !b || a === b) return;
  const pair = [Math.min(a, b), Math.max(a, b)]; const key = pair.join(":");
  if (!groups.has(key)) groups.set(key, { pair, edges: [] });
  groups.get(key).edges.push([[x1, y1], [x2, y2]]);
}
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const a = idAt(x, y);
  if (x + 1 < width) edge(a, idAt(x + 1, y), x + 1, y, x + 1, y + 1);
  if (y + 1 < height) edge(a, idAt(x, y + 1), x, y + 1, x + 1, y + 1);
}
const segments = [];
for (const { pair, edges } of groups.values()) {
  const at = new Map(); const visited = new Set();
  for (let i = 0; i < edges.length; i++) for (const p of edges[i]) { const key = p.join(","); if (!at.has(key)) at.set(key, []); at.get(key).push(i); }
  const walk = (index, start) => {
    const path = [start]; let current = start; let next = index;
    while (next !== undefined && !visited.has(next)) {
      visited.add(next); const e = edges[next]; current = e[0].join(",") === current.join(",") ? e[1] : e[0]; path.push(current);
      const candidates = at.get(current.join(","));
      next = candidates.length === 2 ? candidates.find((i) => !visited.has(i)) : undefined;
    }
    for (let offset = 0; offset < path.length - 1; offset += 32) {
      const points = path.slice(offset, offset + 33).map(([x, y]) => ({ x, y }));
      const pathKey = points.map((p) => `${p.x},${p.y}`).join(";");
      const reverseKey = [...points].reverse().map((p) => `${p.x},${p.y}`).join(";");
      const hash = createHash("sha256").update(pathKey < reverseKey ? pathKey : reverseKey).digest("hex").slice(0, 20);
      segments.push({ id: `${pair.join("-")}:${hash}`, countryIds: pair, points });
    }
  };
  for (const [key, candidates] of at) if (candidates.length !== 2) for (const i of candidates) if (!visited.has(i)) walk(i, key.split(",").map(Number));
  for (let i = 0; i < edges.length; i++) if (!visited.has(i)) walk(i, edges[i][0]);
}
writeFileSync(new URL("../src/data/militaryBorderSegments.json", import.meta.url), JSON.stringify({ width, height, segments }) + "\n", "utf8");
console.log(`Extracted ${segments.length} shared border segments from ${width}x${height} country mask.`);
