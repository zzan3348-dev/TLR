import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = path.join(root, ".codex-tmp", "tno-pack-2", "TLR_TNO_UI_REFERENCE_PACK_v1", "02_POLITICS_AND_LAWS");
const destinationRoot = path.join(root, "public", "assets", "ui", "reference-icons");

const groups = [
  { source: "03_political_laws__src141.png", dir: "laws", names: ["party-system", "religion-policy", "trade-unions", "immigration", "forced-labor", "assembly", "press", "franchise"] },
  { source: "11_military_policies_clean_crop__src133.png", dir: "laws", names: ["service", "officers", "training", "exemptions"] },
  { source: "12_economic_laws_clean_crop__src134.png", dir: "laws", names: ["trade", "income-tax", "minimum-wage", "working-hours", "unemployment", "pensions"] },
  { source: "13_social_laws_clean_crop__src135.png", dir: "laws", names: ["healthcare", "education", "penal-system", "policing", "industry-regulation", "womens-rights"] },
];

const positions = [
  [17, 77], [271, 77], [17, 152], [271, 152],
  [17, 227], [271, 227], [17, 302], [271, 302],
];

const stageSource = readPng(path.join(referenceRoot, "10_law_selection_window__src140.png"));
const stageTarget = path.join(destinationRoot, "stages");
fs.mkdirSync(stageTarget, { recursive: true });
[
  ["1", 1160, 102], ["2", 1160, 267], ["3", 1160, 412],
  ["4", 1160, 578], ["5", 1160, 728],
].forEach(([name, x, y]) => {
  fs.writeFileSync(path.join(stageTarget, `${name}.png`), transparentCrop(stageSource, x + 4, y + 4, 72, 82));
});

const cardTarget = path.join(destinationRoot, "cards");
fs.mkdirSync(cardTarget, { recursive: true });
const card = new PNG({ width: 245, height: 68 });
PNG.bitblt(readPng(path.join(referenceRoot, "03_political_laws__src141.png")), card, 16, 77, 245, 68, 0, 0);
for (let row = 3; row < 48; row += 1) {
  for (let column = 70; column < 243; column += 1) {
    const index = (row * card.width + column) * 4;
    card.data[index] = 7;
    card.data[index + 1] = 16;
    card.data[index + 2] = 17;
    card.data[index + 3] = 255;
  }
}
for (let row = 3; row < 48; row += 1) {
  for (let column = 3; column < 60; column += 1) {
    const index = (row * card.width + column) * 4;
    card.data[index + 3] = 0;
  }
}
fs.writeFileSync(path.join(cardTarget, "law-card-normal.png"), PNG.sync.write(card));

const hudSource = readPng(path.join(root, ".codex-tmp", "tno-pack-2", "TLR_TNO_UI_REFERENCE_PACK_v1", "07_HUD", "01_political_power_tooltip__src186.png"));
const hudTarget = path.join(destinationRoot, "hud");
fs.mkdirSync(hudTarget, { recursive: true });
[
  ["political-power", 104], ["stability", 168], ["war-support", 232], ["manpower", 296],
  ["production", 360], ["gdp", 424], ["national-debt", 488],
].forEach(([name, x]) => {
  fs.writeFileSync(path.join(hudTarget, `${name}.png`), transparentCrop(hudSource, x, 1, 24, 23));
});

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function transparentCrop(source, x, y, width = 64, height = 67) {
  const output = new PNG({ width, height });
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const sourceIndex = ((y + row) * source.width + (x + column)) * 4;
      const targetIndex = (row * width + column) * 4;
      const red = source.data[sourceIndex];
      const green = source.data[sourceIndex + 1];
      const blue = source.data[sourceIndex + 2];
      const peak = Math.max(red, green, blue);
      const edge = column < 3 || column >= width - 3 || row < 3 || row >= height - 3;
      output.data[targetIndex] = red;
      output.data[targetIndex + 1] = green;
      output.data[targetIndex + 2] = blue;
      output.data[targetIndex + 3] = edge || peak < 42 ? 0 : Math.min(255, Math.max(0, (peak - 34) * 12));
    }
  }
  return PNG.sync.write(output);
}

for (const group of groups) {
  const source = readPng(path.join(referenceRoot, group.source));
  const target = path.join(destinationRoot, group.dir);
  fs.mkdirSync(target, { recursive: true });
  group.names.forEach((name, index) => {
    const [x, y] = positions[index];
    fs.writeFileSync(path.join(target, `${name}.png`), transparentCrop(source, x, y, 52, 58));
  });
}

console.log(`Extracted ${groups.reduce((count, group) => count + group.names.length, 0)} reference icon assets.`);
