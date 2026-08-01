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
const idMapPath = path.join(
  projectRoot,
  "public",
  "maps",
  "generated",
  "world-1932-clean-id-map.png",
);
const seed = { x: 4874, y: 1402 };
const sourceCountryId = 53;
const sourceColor = { r: 168, g: 83, b: 13 };
const australiaColor = { r: 63, g: 80, b: 127 };

function readOutputPath() {
  const outputIndex = process.argv.indexOf("--output");
  const output = process.argv[outputIndex + 1];
  if (outputIndex < 0 || !output) {
    throw new Error(
      '사용법: node scripts/merge-western-papua.mjs --output "<출력 PNG 경로>"',
    );
  }
  return path.resolve(process.cwd(), output);
}

function readCountryId(idMap, pixelIndex) {
  const offset = pixelIndex * 4;
  return (
    idMap.data[offset] |
    (idMap.data[offset + 1] << 8) |
    (idMap.data[offset + 2] << 16)
  );
}

function colorDistance(data, offset, color) {
  return Math.hypot(
    data[offset] - color.r,
    data[offset + 1] - color.g,
    data[offset + 2] - color.b,
  );
}

async function main() {
  const outputPath = readOutputPath();
  const [sourceBuffer, idMapBuffer] = await Promise.all([
    readFile(sourcePath),
    readFile(idMapPath),
  ]);
  const source = PNG.sync.read(sourceBuffer);
  const idMap = PNG.sync.read(idMapBuffer);
  if (
    source.width !== idMap.width ||
    source.height !== idMap.height
  ) {
    throw new Error("원본 지도와 clean ID map의 크기가 다릅니다.");
  }

  const pixelCount = source.width * source.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  const seedIndex = seed.y * source.width + seed.x;
  if (readCountryId(idMap, seedIndex) !== sourceCountryId) {
    throw new Error("서부 파푸아 시드가 오라녜-누산타라 영토가 아닙니다.");
  }

  let head = 0;
  let tail = 0;
  queue[tail] = seedIndex;
  tail += 1;
  visited[seedIndex] = 1;
  let ownershipPixels = 0;
  let changedPixels = 0;

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    ownershipPixels += 1;
    const x = pixelIndex % source.width;
    const y = Math.floor(pixelIndex / source.width);
    const offset = pixelIndex * 4;
    if (
      colorDistance(source.data, offset, sourceColor) <= 14 ||
      colorDistance(source.data, offset, australiaColor) <= 14
    ) {
      source.data[offset] = australiaColor.r;
      source.data[offset + 1] = australiaColor.g;
      source.data[offset + 2] = australiaColor.b;
      changedPixels += 1;
    }

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= source.width ||
          neighborY >= source.height
        ) {
          continue;
        }
        const neighborIndex =
          neighborY * source.width + neighborX;
        if (
          visited[neighborIndex] === 1 ||
          readCountryId(idMap, neighborIndex) !== sourceCountryId
        ) {
          continue;
        }
        visited[neighborIndex] = 1;
        queue[tail] = neighborIndex;
        tail += 1;
      }
    }
  }

  if (ownershipPixels !== 8357 || changedPixels === 0) {
    throw new Error(
      `서부 파푸아 범위 검증 실패: ownership=${ownershipPixels}, changed=${changedPixels}`,
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, PNG.sync.write(source));
  console.log(
    JSON.stringify(
      {
        input: sourcePath,
        output: outputPath,
        ownershipPixels,
        changedPixels,
        fromCountryId: sourceCountryId,
        toCountryId: 60,
      },
      null,
      2,
    ),
  );
}

await main();
