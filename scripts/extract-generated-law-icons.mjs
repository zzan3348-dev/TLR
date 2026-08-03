import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PNG } from "pngjs";

const root = process.cwd();
const spriteDir = path.resolve(root, "public/assets/ui/generated-icons/sprites");
const stageDir = path.resolve(root, "public/assets/ui/generated-icons/stages");
const baseDir = path.resolve(root, "public/assets/ui/generated-icons/laws");
fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(baseDir, { recursive: true });
for (const entry of fs.readdirSync(baseDir)) {
  if (entry.endsWith(".png")) fs.unlinkSync(path.join(baseDir, entry));
}
for (const entry of fs.readdirSync(stageDir)) {
  fs.rmSync(path.join(stageDir, entry), { recursive: true, force: true });
}

const groups = {
  political: {
    file: "political-law-sprite.png", cols: 5, rows: 8,
    laws: ["party-system", "religion-policy", "trade-unions", "immigration", "forced-labor", "assembly", "press", "franchise"],
  },
  economy: {
    file: "economy-law-sprite.png", cols: 5, rows: 8,
    laws: ["trade", "income-tax", "minimum-wage", "working-hours", "unemployment", "pensions", "industry-ownership", "land-system"],
  },
  military: {
    file: "military-law-sprite.png", cols: 5, rows: 4,
    laws: ["service", "officers", "training", "exemptions"],
  },
  social: {
    // The social sprite is a six-row sheet: healthcare, education,
    // penal-system, policing, industry-regulation, and womens-rights.
    // Keeping all six rows in one definition prevents the fifth and sixth
    // rows from being merged into a single crop and preserves each pictogram
    // as its own transparent asset.
    file: "social-law-sprite.png", cols: 5, rows: 6,
    laws: ["healthcare", "education", "penal-system", "policing", "industry-regulation", "womens-rights"],
  },
};

function isChroma(r, g, b) {
  return g > 145 && g > r * 1.18 && g > b * 1.18;
}

function cropIcon(input, x0, y0, x1, y1) {
  const width = x1 - x0;
  const height = y1 - y0;
  const mask = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (mask[i]) return;
    const p = ((y0 + y) * input.width + x0 + x) * 4;
    if (!isChroma(input.data[p], input.data[p + 1], input.data[p + 2])) return;
    mask[i] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { push(0, y); push(width - 1, y); }
  for (let i = 0; i < queue.length; i += 1) {
    const [x, y] = queue[i];
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  // Discard thin fragments that crossed into this cell from the row above or
  // below. The actual pictogram can contain several disconnected parts, so
  // remove only components touching an edge and no taller than a small band.
  const foreground = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const p = ((y0 + y) * input.width + x0 + x) * 4;
      // Remove chroma pixels everywhere, not only the flood-filled outer
      // background. Some pictograms (notably the industry-regulation
      // factory) enclose a small green-screen pocket inside their outline;
      // retaining those pixels leaves a bright rectangular halo in the PNG.
      foreground[i] = mask[i] === 0 && input.data[p + 3] > 8 &&
        !isChroma(input.data[p], input.data[p + 1], input.data[p + 2]) ? 1 : 0;
    }
  }
  const visited = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!foreground[start] || visited[start]) continue;
      const parts = [[x, y]];
      const component = [];
      visited[start] = 1;
      for (let i = 0; i < parts.length; i += 1) {
        const [cx, cy] = parts[i];
        component.push([cx, cy]);
        for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
          for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = ny * width + nx;
            if (foreground[next] && !visited[next]) {
              visited[next] = 1;
              parts.push([nx, ny]);
            }
          }
        }
      }
      const ys = component.map(([, cy]) => cy);
      const xs = component.map(([cx]) => cx);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const shortEdgeFragment = (minY <= 3 || maxY >= height - 4) &&
        (maxY - minY + 1 <= 18 || maxX - minX + 1 <= 18);
      if (shortEdgeFragment) {
        for (const [cx, cy] of component) foreground[cy * width + cx] = 0;
      }
    }
  }
  const points = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (foreground[i]) points.push([x, y]);
    }
  }
  if (points.length === 0) return null;
  const pad = 8;
  const minX = Math.max(0, Math.min(...points.map(([x]) => x)) - pad);
  const maxX = Math.min(width - 1, Math.max(...points.map(([x]) => x)) + pad);
  const minY = Math.max(0, Math.min(...points.map(([, y]) => y)) - pad);
  const maxY = Math.min(height - 1, Math.max(...points.map(([, y]) => y)) + pad);
  const output = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const source = ((y0 + y) * input.width + x0 + x) * 4;
      const target = ((y - minY) * output.width + x - minX) * 4;
      const alpha = foreground[y * width + x] ? input.data[source + 3] : 0;
      output.data[target] = alpha ? input.data[source] : 0;
      output.data[target + 1] = alpha ? input.data[source + 1] : 0;
      output.data[target + 2] = alpha ? input.data[source + 2] : 0;
      output.data[target + 3] = alpha;
    }
  }
  return output;
}

function removeGreenScreenFringe(image) {
  for (let i = 0; i < image.data.length; i += 4) {
    const red = image.data[i];
    const green = image.data[i + 1];
    const blue = image.data[i + 2];
    // The factory cell contains the bright green sprite background inside
    // the outline. It is not part of the pictogram, so clear only the
    // strongly green/yellow screen fringe while retaining dark line art.
    if (image.data[i + 3] > 8 && green > 35 && green > red * 1.1 &&
      green > blue * 1.1 && blue < 80) {
      image.data[i + 3] = 0;
    }
  }
}

function writeGroup(groupName, definition) {
  const source = path.join(spriteDir, definition.file);
  if (!fs.existsSync(source)) throw new Error(`Missing sprite sheet: ${source}`);
  const input = PNG.sync.read(fs.readFileSync(source));
  const groupDir = path.join(stageDir, groupName);
  fs.mkdirSync(groupDir, { recursive: true });
  const cellWidth = input.width / definition.cols;
  const cellHeight = input.height / definition.rows;
  definition.laws.forEach((lawId, row) => {
    for (let order = 0; order < definition.cols; order += 1) {
      // The generated sheets use generous gutters, but a few tall pictograms
      // slightly cross a row boundary. Keep a narrow safety gutter so a
      // neighbour can never become part of the exported icon.
      const gutterX = Math.min(7, Math.floor(cellWidth * 0.035));
      const gutterY = Math.min(14, Math.floor(cellHeight * 0.085));
      const x0 = Math.floor(order * cellWidth) + gutterX;
      const x1 = Math.min(input.width, Math.floor((order + 1) * cellWidth) - gutterX);
      const y0 = Math.floor(row * cellHeight) + gutterY;
      const y1 = Math.min(input.height, Math.floor((row + 1) * cellHeight) - gutterY);
      const icon = cropIcon(input, x0, y0, x1, y1);
      if (!icon) continue;
      if (lawId === "industry-regulation" && order === 0) {
        removeGreenScreenFringe(icon);
      }
      fs.writeFileSync(path.join(groupDir, `${lawId}-${order + 1}.png`), PNG.sync.write(icon));
    }
    const first = path.join(groupDir, `${lawId}-1.png`);
    if (fs.existsSync(first)) fs.copyFileSync(first, path.join(baseDir, `${lawId}.png`));
  });
}

for (const [name, definition] of Object.entries(groups)) writeGroup(name, definition);

// Legacy generated names remain available as aliases for existing callers.
const aliases = {
  "open-borders": "immigration-5", "closed-borders": "immigration-1", censorship: "press-1",
  "permit-system": "assembly-2", "registration-system": "assembly-4", "assembly-open": "assembly-5",
};
for (const [alias, target] of Object.entries(aliases)) {
  const source = path.join(stageDir, "political", `${target}.png`);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(baseDir, `${alias}.png`));
}
console.log("Generated screenshot-driven law icon stages in", stageDir);
