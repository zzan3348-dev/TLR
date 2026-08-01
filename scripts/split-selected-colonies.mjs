import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(
  projectRoot,
  "public",
  "maps",
  "world-1932.png",
);
const componentsPath = path.join(
  projectRoot,
  "src",
  "data",
  "mapCountryComponents.json",
);

const territoryChanges = [
  {
    name: "캐나다",
    parentColor: "#2E3A6B",
    color: "#465584",
    componentIds: ["country-002-component-001"],
  },
  {
    name: "인도",
    parentColor: "#2E3A6B",
    color: "#53628F",
    componentIds: ["country-002-component-009"],
  },
  {
    name: "호주",
    parentColor: "#2E3A6B",
    color: "#3F507F",
    componentIds: [
      "country-002-component-019",
      "country-002-component-027",
    ],
  },
  {
    name: "뉴질랜드",
    parentColor: "#2E3A6B",
    color: "#5B6996",
    componentIds: ["country-002-component-026"],
  },
  {
    name: "남아프리카공화국",
    parentColor: "#2E3A6B",
    color: "#4B5C88",
    componentIds: ["country-002-component-025"],
  },
  {
    name: "필리핀",
    parentColor: "#143272",
    color: "#315895",
    componentIds: ["country-001-component-010"],
  },
];

function readOutputPath() {
  const outputIndex = process.argv.indexOf("--output");
  const output = process.argv[outputIndex + 1];
  if (outputIndex < 0 || !output) {
    throw new Error(
      '사용법: node scripts/split-selected-colonies.mjs --output "<출력 PNG 경로>"',
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

function isRecolorablePixel(pixel, parent, replacement) {
  if (pixel.a <= 10) {
    return false;
  }
  return (
    colorDistance(pixel, parent) <= 14 ||
    colorDistance(pixel, replacement) <= 14
  );
}

async function main() {
  const outputPath = readOutputPath();
  const [sourceBuffer, componentsContents] = await Promise.all([
    readFile(sourcePath),
    readFile(componentsPath, "utf8"),
  ]);
  const source = PNG.sync.read(sourceBuffer);
  const components = JSON.parse(componentsContents);
  const componentsById = new Map(
    components.map((component) => [component.componentId, component]),
  );
  const summaries = [];

  for (const change of territoryChanges) {
    const parent = hexToRgb(change.parentColor);
    const replacement = hexToRgb(change.color);
    let changedPixels = 0;

    for (const componentId of change.componentIds) {
      const component = componentsById.get(componentId);
      if (!component) {
        throw new Error(`영토 컴포넌트를 찾을 수 없습니다: ${componentId}`);
      }
      const maskPath = path.join(
        projectRoot,
        "public",
        component.maskPath.replace(/^\//u, ""),
      );
      const mask = PNG.sync.read(await readFile(maskPath));
      if (
        mask.width !== component.bounds.width ||
        mask.height !== component.bounds.height
      ) {
        throw new Error(`마스크 크기가 일치하지 않습니다: ${componentId}`);
      }

      for (let localY = 0; localY < mask.height; localY += 1) {
        for (let localX = 0; localX < mask.width; localX += 1) {
          const maskIndex = (localY * mask.width + localX) * 4;
          if (
            mask.data[maskIndex + 3] <= 10 ||
            mask.data[maskIndex] < 128
          ) {
            continue;
          }
          const mapX = component.bounds.x + localX;
          const mapY = component.bounds.y + localY;
          const sourceIndex = (mapY * source.width + mapX) * 4;
          const pixel = {
            r: source.data[sourceIndex],
            g: source.data[sourceIndex + 1],
            b: source.data[sourceIndex + 2],
            a: source.data[sourceIndex + 3],
          };
          if (!isRecolorablePixel(pixel, parent, replacement)) {
            continue;
          }
          source.data[sourceIndex] = replacement.r;
          source.data[sourceIndex + 1] = replacement.g;
          source.data[sourceIndex + 2] = replacement.b;
          changedPixels += 1;
        }
      }
    }

    if (changedPixels === 0) {
      throw new Error(`${change.name} 영토에서 변경할 픽셀을 찾지 못했습니다.`);
    }
    summaries.push({
      name: change.name,
      color: change.color,
      changedPixels,
      componentIds: change.componentIds,
    });
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, PNG.sync.write(source));
  console.log(
    JSON.stringify(
      {
        input: sourcePath,
        output: outputPath,
        width: source.width,
        height: source.height,
        territories: summaries,
      },
      null,
      2,
    ),
  );
}

await main();
