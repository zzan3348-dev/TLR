import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectRoot, "public", "maps", "world-1932.png");
const componentDataPath = path.join(
  projectRoot,
  "work",
  "thin-border-data",
  "mapCountryComponents.json",
);
const currentComponentDataPath = path.join(
  projectRoot,
  "src",
  "data",
  "mapCountryComponents.json",
);
const maskDirectory = path.join(
  projectRoot,
  "work",
  "thin-border-generation",
  "country-masks",
);
const currentMaskDirectory = path.join(
  projectRoot,
  "public",
  "maps",
  "generated",
  "country-masks",
);

const territoryChanges = [
  { countryId: 57, color: "#465584", componentId: "country-057-component-001" },
  { countryId: 58, color: "#53628F", componentId: "country-058-component-001" },
  { countryId: 59, color: "#315895", componentId: "country-059-component-001", parentColor: "#143272" },
  { countryId: 60, color: "#3F507F", componentId: "country-060-component-001" },
  { countryId: 61, color: "#4B5C88", componentId: "country-061-component-001" },
  { countryId: 62, color: "#5B6996", componentId: "country-062-component-001" },
];

const staleComponentRestores = [
  { componentId: "country-059-component-001", parentColor: "#143272" },
  { componentId: "country-060-component-001", parentColor: "#2E3A6B" },
  { componentId: "country-060-component-002", parentColor: "#2E3A6B" },
  { componentId: "country-061-component-001", parentColor: "#2E3A6B" },
  { componentId: "country-061-component-002", parentColor: "#2E3A6B" },
  { componentId: "country-062-component-001", parentColor: "#2E3A6B" },
];

function readOutputPath() {
  const outputIndex = process.argv.indexOf("--output");
  const output = process.argv[outputIndex + 1];
  if (outputIndex < 0 || !output) {
    throw new Error(
      'Usage: node scripts/restore-colonial-territories.mjs --output "<output PNG>"',
    );
  }
  return path.resolve(process.cwd(), output);
}

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function colorDistance(first, second) {
  return Math.hypot(
    first.r - second.r,
    first.g - second.g,
    first.b - second.b,
  );
}

async function main() {
  const outputPath = readOutputPath();
  const [sourceBuffer, componentBuffer, currentComponentBuffer] = await Promise.all([
    readFile(sourcePath),
    readFile(componentDataPath, "utf8"),
    readFile(currentComponentDataPath, "utf8"),
  ]);
  const source = PNG.sync.read(sourceBuffer);
  const components = JSON.parse(componentBuffer);
  const componentsById = new Map(
    components.map((component) => [component.componentId, component]),
  );
  const currentComponentsById = new Map(
    JSON.parse(currentComponentBuffer).map((component) => [component.componentId, component]),
  );
  const summaries = [];

  // The latest map replacement left a handful of old colony colors in their
  // former locations. Restore those stale pixels to the British Empire fill
  // before applying the canonical territory masks.
  for (const restore of staleComponentRestores) {
    const component = currentComponentsById.get(restore.componentId);
    if (!component) {
      continue;
    }
    const mask = PNG.sync.read(
      await readFile(path.join(currentMaskDirectory, path.basename(component.maskPath))),
    );
    const parent = hexToRgb(restore.parentColor);
    let restoredPixels = 0;
    for (let localY = 0; localY < mask.height; localY += 1) {
      for (let localX = 0; localX < mask.width; localX += 1) {
        const maskOffset = (localY * mask.width + localX) * 4;
        if (mask.data[maskOffset + 3] <= 10 || mask.data[maskOffset] < 128) {
          continue;
        }
        const mapX = component.bounds.x + localX;
        const mapY = component.bounds.y + localY;
        const sourceOffset = (mapY * source.width + mapX) * 4;
        const current = {
          r: source.data[sourceOffset],
          g: source.data[sourceOffset + 1],
          b: source.data[sourceOffset + 2],
        };
        if (colorDistance(current, parent) <= 14) {
          continue;
        }
        source.data[sourceOffset] = parent.r;
        source.data[sourceOffset + 1] = parent.g;
        source.data[sourceOffset + 2] = parent.b;
        restoredPixels += 1;
      }
    }
    summaries.push({ ...restore, restoredPixels });
  }

  for (const change of territoryChanges) {
    const component = componentsById.get(change.componentId);
    if (!component) {
      throw new Error(`Missing component ${change.componentId}`);
    }
    const mask = PNG.sync.read(
      await readFile(path.join(maskDirectory, path.basename(component.maskPath))),
    );
    if (mask.width !== component.bounds.width || mask.height !== component.bounds.height) {
      throw new Error(`Mask size mismatch for ${change.componentId}`);
    }

    const replacement = hexToRgb(change.color);
    const parent = hexToRgb(change.parentColor ?? "#2E3A6B");
    let changedPixels = 0;
    let maskPixels = 0;
    for (let localY = 0; localY < mask.height; localY += 1) {
      for (let localX = 0; localX < mask.width; localX += 1) {
        const maskOffset = (localY * mask.width + localX) * 4;
        if (mask.data[maskOffset + 3] <= 10 || mask.data[maskOffset] < 128) {
          continue;
        }
        maskPixels += 1;
        const mapX = component.bounds.x + localX;
        const mapY = component.bounds.y + localY;
        const sourceOffset = (mapY * source.width + mapX) * 4;
        const current = {
          r: source.data[sourceOffset],
          g: source.data[sourceOffset + 1],
          b: source.data[sourceOffset + 2],
        };
        if (colorDistance(current, parent) > 14 && colorDistance(current, replacement) > 14) {
          continue;
        }
        if (current.r === replacement.r && current.g === replacement.g && current.b === replacement.b) {
          continue;
        }
        source.data[sourceOffset] = replacement.r;
        source.data[sourceOffset + 1] = replacement.g;
        source.data[sourceOffset + 2] = replacement.b;
        changedPixels += 1;
      }
    }
    if (maskPixels === 0) {
      throw new Error(`No territory pixels found for country ${change.countryId}`);
    }
    summaries.push({ ...change, maskPixels, changedPixels });
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, PNG.sync.write(source));
  console.log(JSON.stringify({ input: sourcePath, output: outputPath, territories: summaries }, null, 2));
}

await main();
