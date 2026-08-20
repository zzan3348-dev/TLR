import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const generatedDirectory = path.join(projectRoot, "public", "maps", "generated");
const countryIdMapPath = path.join(generatedDirectory, "world-1932-id-map.png");
const provinceLinesPath = path.join(generatedDirectory, "world-1932-province-lines.png");
const provinceIdMapPath = path.join(generatedDirectory, "world-1932-province-id-map.png");
const provinceDataPath = path.join(projectRoot, "src", "data", "mapProvinces.json");

const decodeId = (data, pixelIndex) => {
  const offset = pixelIndex * 4;
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
};

const encodeId = (data, pixelIndex, id) => {
  const offset = pixelIndex * 4;
  data[offset] = id & 255;
  data[offset + 1] = (id >> 8) & 255;
  data[offset + 2] = (id >> 16) & 255;
  data[offset + 3] = id > 0 ? 255 : 0;
};

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

async function readPreviousProvinces() {
  try {
    await access(provinceDataPath);
    const parsed = JSON.parse(await readFile(provinceDataPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countryKey(countryId) {
  return `country-${String(countryId).padStart(3, "0")}`;
}

async function main() {
  const [countryIdMap, provinceLines, previous] = await Promise.all([
    readFile(countryIdMapPath).then(PNG.sync.read),
    readFile(provinceLinesPath).then(PNG.sync.read),
    readPreviousProvinces(),
  ]);
  if (
    countryIdMap.width !== provinceLines.width ||
    countryIdMap.height !== provinceLines.height
  ) {
    throw new Error("국가 ID 맵과 프로빈스선 레이어의 크기가 일치하지 않습니다.");
  }

  const { width, height } = countryIdMap;
  const pixelCount = width * height;
  const labels = new Uint32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];
  let nextLabel = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (labels[start] !== 0 || provinceLines.data[start * 4 + 3] > 0) continue;
    const ownerId = decodeId(countryIdMap.data, start);
    // 0은 바다, 0xFFFF는 국가 ID 맵의 미지정 영토 sentinel이다.
    if (ownerId === 0 || ownerId === 0xffff) continue;

    nextLabel += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = nextLabel;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (
          neighbor < 0 ||
          labels[neighbor] !== 0 ||
          provinceLines.data[neighbor * 4 + 3] > 0 ||
          decodeId(countryIdMap.data, neighbor) !== ownerId
        ) continue;
        labels[neighbor] = nextLabel;
        queue[tail++] = neighbor;
      }
    }

    if (count > 1) {
      components.push({
        label: nextLabel,
        ownerId,
        pixelCount: count,
        minX,
        minY,
        maxX,
        maxY,
        centroidX: sumX / count,
        centroidY: sumY / count,
        seedIndex: start,
      });
    }
  }

  const previousByLabel = new Map();
  for (const province of previous) {
    const seed = province?.seed;
    if (!seed || !Number.isInteger(seed.x) || !Number.isInteger(seed.y)) continue;
    if (seed.x < 0 || seed.x >= width || seed.y < 0 || seed.y >= height) continue;
    const label = labels[seed.y * width + seed.x];
    if (label > 0 && province.ownerCountryKey === countryKey(decodeId(countryIdMap.data, seed.y * width + seed.x))) {
      previousByLabel.set(label, province.id);
    }
  }

  const usedIds = new Set();
  const provinceIdMap = new PNG({ width, height, colorType: 6 });
  const provinces = components.map((component, index) => {
    const key = countryKey(component.ownerId);
    let id = previousByLabel.get(component.label);
    if (!id || usedIds.has(id)) {
      id = `${key}-p-${stableHash(`${key}:${component.seedIndex % width}:${Math.floor(component.seedIndex / width)}`)}`;
      let suffix = 1;
      while (usedIds.has(id)) id = `${id}-${suffix++}`;
    }
    usedIds.add(id);
    const mapId = index + 1;
    return {
      id,
      ownerCountryKey: key,
      mapId,
      bounds: {
        x: component.minX,
        y: component.minY,
        width: component.maxX - component.minX + 1,
        height: component.maxY - component.minY + 1,
      },
      centroid: { x: component.centroidX, y: component.centroidY },
      seed: {
        x: component.seedIndex % width,
        y: Math.floor(component.seedIndex / width),
      },
      pixelCount: component.pixelCount,
      _label: component.label,
    };
  });

  const mapIdByLabel = new Uint32Array(nextLabel + 1);
  for (const province of provinces) mapIdByLabel[province._label] = province.mapId;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const mapId = mapIdByLabel[labels[pixelIndex]];
    if (mapId > 0) encodeId(provinceIdMap.data, pixelIndex, mapId);
  }

  const output = provinces
    .map((province) => ({
      id: province.id,
      ownerCountryKey: province.ownerCountryKey,
      mapId: province.mapId,
      bounds: province.bounds,
      centroid: province.centroid,
      seed: province.seed,
      pixelCount: province.pixelCount,
    }))
    .sort((first, second) => first.ownerCountryKey.localeCompare(second.ownerCountryKey) || first.id.localeCompare(second.id));
  await mkdir(generatedDirectory, { recursive: true });
  await Promise.all([
    writeFile(provinceIdMapPath, PNG.sync.write(provinceIdMap)),
    writeFile(path.join(generatedDirectory, "map-provinces.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8"),
    writeFile(provinceDataPath, `${JSON.stringify(output, null, 2)}\n`, "utf8"),
  ]);
  process.stdout.write(`프로빈스 ${output.length}개 생성 완료\n`);
}

await main();
