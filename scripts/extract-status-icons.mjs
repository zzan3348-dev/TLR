import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PNG } from "pngjs";

const root = process.cwd();
const sourcePath = path.resolve(root, "public/assets/ui/generated-icons/sprites/hud-icons-sprite.png");
const outputDir = path.resolve(root, "public/assets/ui/generated-icons/status");
fs.mkdirSync(outputDir, { recursive: true });
const input = PNG.sync.read(fs.readFileSync(sourcePath));
const names = ["political-power", "stability", "war-support", "manpower", "production", "gdp", "national-debt"];
const cellWidth = input.width / names.length;
const isChroma = (r, g, b) => g > 145 && g > r * 1.18 && g > b * 1.18;

for (let index = 0; index < names.length; index += 1) {
  const x0 = Math.floor(index * cellWidth) + 8;
  const x1 = Math.floor((index + 1) * cellWidth) - 8;
  const y0 = 10;
  const y1 = input.height - 10;
  const width = x1 - x0;
  const height = y1 - y0;
  const queue = [];
  const background = new Uint8Array(width * height);
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (background[i]) return;
    const p = ((y0 + y) * input.width + x0 + x) * 4;
    if (!isChroma(input.data[p], input.data[p + 1], input.data[p + 2])) return;
    background[i] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { push(0, y); push(width - 1, y); }
  for (let i = 0; i < queue.length; i += 1) {
    const [x, y] = queue[i];
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  const points = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!background[y * width + x]) points.push([x, y]);
    }
  }
  let minPointX = width; let maxPointX = 0; let minPointY = height; let maxPointY = 0;
  for (const [x, y] of points) {
    minPointX = Math.min(minPointX, x); maxPointX = Math.max(maxPointX, x);
    minPointY = Math.min(minPointY, y); maxPointY = Math.max(maxPointY, y);
  }
  const minX = Math.max(0, minPointX - 10);
  const maxX = Math.min(width - 1, maxPointX + 10);
  const minY = Math.max(0, minPointY - 10);
  const maxY = Math.min(height - 1, maxPointY + 10);
  const output = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const source = ((y0 + y) * input.width + x0 + x) * 4;
      const target = ((y - minY) * output.width + x - minX) * 4;
      const pureChroma = input.data[source + 1] > 200 && input.data[source] < 80 && input.data[source + 2] < 140;
      const alpha = background[y * width + x] || pureChroma ? 0 : input.data[source + 3];
      output.data[target] = alpha ? input.data[source] : 0;
      output.data[target + 1] = alpha ? input.data[source + 1] : 0;
      output.data[target + 2] = alpha ? input.data[source + 2] : 0;
      output.data[target + 3] = alpha;
    }
  }
  fs.writeFileSync(path.join(outputDir, `${names[index]}.png`), PNG.sync.write(output));
}
console.log(`Generated ${names.length} status icons in ${outputDir}`);
