import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const idMapPath = path.join(
  projectRoot,
  "public",
  "maps",
  "generated",
  "world-1932-id-map.png",
);
const outputPath = path.join(projectRoot, "src", "data", "mapCapitals.json");
const reportPath = path.join(
  projectRoot,
  "public",
  "maps",
  "generated",
  "map-capital-report.json",
);

// 모든 도시는 실제 경위도를 사용한다. 좌표는 개별 국가에 맞춰 이동시키지 않고,
// 전체 지도에 공통인 단일 원통 투영식으로만 원본 이미지 좌표로 변환한다.
const CAPITALS = [
  [1, "워싱턴 D.C.", 38.9072, -77.0369],
  [2, "런던", 51.5072, -0.1276],
  [3, "모스크바", 55.7558, 37.6173],
  [4, "옴스크", 54.9914, 73.3686],
  [5, "스톡홀름", 59.3293, 18.0686],
  [6, "리가", 56.9496, 24.1052],
  [7, "시카고", 41.8781, -87.6298],
  [8, "베를린", 52.52, 13.405],
  [9, "세미팔라틴스크", 50.4111, 80.2275],
  [10, "블라디보스토크", 43.1155, 131.8869],
  [11, "바르샤바", 52.2297, 21.0122],
  [12, "베이징", 39.9042, 116.4074],
  [13, "파리", 48.8566, 2.3522],
  [14, "키이우", 50.4501, 30.5234],
  [15, "울란바토르", 47.8864, 106.9057],
  [16, "프라하", 50.0755, 14.4378],
  [17, "뮌헨", 48.1351, 11.582],
  [18, "도쿄", 35.6895, 139.6917],
  [19, "부다페스트", 47.4979, 19.0402],
  [20, "디화", 43.8256, 87.6168],
  [21, "빈", 48.2082, 16.3738],
  [22, "부쿠레슈티", 44.4268, 26.1025],
  [23, "베른", 46.948, 7.4474],
  [24, "로마", 41.9028, 12.4964],
  [25, "베오그라드", 44.7866, 20.4489],
  [26, "트빌리시", 41.7151, 44.8271],
  [27, "타슈켄트", 41.2995, 69.2401],
  [28, "한성", 37.5665, 126.978],
  [29, "마드리드", 40.4168, -3.7038],
  [30, "사라고사", 41.6488, -0.8891],
  [31, "콘스탄티니예", 41.0082, 28.9784],
  [32, "테헤란", 35.6892, 51.389],
  [33, "멕시코시티", 19.4326, -99.1332],
  [34, "시안", 34.3416, 108.9398],
  [35, "라싸", 29.652, 91.1721],
  [36, "난징", 32.0603, 118.7969],
  [37, "아바나", 23.1136, -82.3666],
  [38, "청두", 30.5728, 104.0665],
  [39, "난창", 28.682, 115.8582],
  [40, "리야드", 24.7136, 46.6753],
  [41, "카트만두", 27.7172, 85.324],
  [42, "하노이", 21.0278, 105.8342],
  [43, "쿤밍", 24.8801, 102.8329],
  [44, "바마코", 12.6392, -8.0029],
  [45, "광저우", 23.1291, 113.2644],
  [46, "보고타", 4.711, -74.0721],
  [47, "소코토", 13.0059, 5.2476],
  [48, "아디스아바바", 8.9806, 38.7578],
  [49, "리우데자네이루", -22.9068, -43.1729],
  [50, "쿠마시", 6.6885, -1.6244],
  [51, "레오폴드빌", -4.4419, 15.2663],
  [52, "리마", -12.0464, -77.0428],
  [53, "바타비아", -6.2088, 106.8456],
  [54, "산티아고", -33.4489, -70.6693],
  [55, "솔즈베리", -17.8292, 31.0522],
  [56, "부에노스아이레스", -34.6037, -58.3816],
  [57, "오타와", 45.4215, -75.6972],
  [58, "뉴델리", 28.6139, 77.209],
  [59, "마닐라", 14.5995, 120.9842],
  [60, "캔버라", -35.2809, 149.13],
  [61, "프리토리아", -25.7479, 28.2293],
  [62, "웰링턴", -41.2924, 174.7787],
].map(([countryId, name, latitude, longitude]) => ({
  countryId,
  countryKey: `country-${String(countryId).padStart(3, "0")}`,
  name,
  latitude,
  longitude,
}));

function decodeMapId(data, width, x, y) {
  if (x < 0 || y < 0 || x >= width) return 0;
  const index = (y * width + x) * 4;
  return data[index] + (data[index + 1] << 8) + (data[index + 2] << 16);
}

function dominantMapId(png, x, y, radius = 2) {
  const counts = new Map();
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const pixelX = Math.round(x) + offsetX;
      const pixelY = Math.round(y) + offsetY;
      if (pixelY < 0 || pixelY >= png.height) continue;
      const countryId = decodeMapId(png.data, png.width, pixelX, pixelY);
      if (countryId === 0) continue;
      counts.set(countryId, (counts.get(countryId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(
    ([firstId, firstCount], [secondId, secondCount]) =>
      secondCount - firstCount || firstId - secondId,
  )[0]?.[0] ?? 0;
}

function project(capital, png, projection) {
  return {
    x:
      ((capital.longitude + 180) / 360) * png.width +
      projection.xOffset,
    y: projection.yIntercept - capital.latitude * projection.yScale,
  };
}

function scoreProjection(png, projection) {
  return CAPITALS.reduce((score, capital) => {
    const point = project(capital, png, projection);
    return score +
      (dominantMapId(png, point.x, point.y) === capital.countryId ? 1 : 0);
  }, 0);
}

function buildCountryBounds(png) {
  const bounds = new Map();
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const countryId = decodeMapId(png.data, png.width, x, y);
      if (countryId <= 0) continue;
      const current = bounds.get(countryId);
      if (!current) {
        bounds.set(countryId, { minX: x, minY: y, maxX: x, maxY: y });
        continue;
      }
      current.minX = Math.min(current.minX, x);
      current.minY = Math.min(current.minY, y);
      current.maxX = Math.max(current.maxX, x);
      current.maxY = Math.max(current.maxY, y);
    }
  }
  return bounds;
}

function findNearestCountryPixel(png, countryBounds, countryId, originX, originY) {
  const bounds = countryBounds.get(countryId);
  if (!bounds) return null;
  let best = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  // 국가 전체 bounds를 검사하므로 본토와 떨어진 섬/MultiPolygon도 빠지지 않는다.
  // 5x5 우세 ID까지 일치하는 내부 픽셀을 우선하여 해안선 위 배치를 피한다.
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const deltaY = y - originY;
    if (deltaY * deltaY > bestDistanceSquared) continue;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (decodeMapId(png.data, png.width, x, y) !== countryId) continue;
      const deltaX = x - originX;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared >= bestDistanceSquared) continue;
      if (dominantMapId(png, x, y) !== countryId) continue;
      bestDistanceSquared = distanceSquared;
      best = { x, y, distance: Math.sqrt(distanceSquared) };
    }
  }

  // 매우 작은 섬처럼 5x5 내부점이 전혀 없을 때만 원시 마스크의 최근접점을 쓴다.
  if (best) return best;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (decodeMapId(png.data, png.width, x, y) !== countryId) continue;
      const distanceSquared = (x - originX) ** 2 + (y - originY) ** 2;
      if (distanceSquared >= bestDistanceSquared) continue;
      bestDistanceSquared = distanceSquared;
      best = { x, y, distance: Math.sqrt(distanceSquared) };
    }
  }
  return best;
}

function calibrateProjection(png) {
  const resolutionScale = png.width / 2048;
  let best = {
    xOffset: 0,
    yIntercept: 472 * resolutionScale,
    yScale: 5.63 * resolutionScale,
    score: -1,
  };
  const search = (center, xRange, interceptRange, scaleRange, steps) => {
    for (
      let xOffset = center.xOffset - xRange;
      xOffset <= center.xOffset + xRange;
      xOffset += steps.x
    ) {
      for (
        let yIntercept = center.yIntercept - interceptRange;
        yIntercept <= center.yIntercept + interceptRange;
        yIntercept += steps.intercept
      ) {
        for (
          let yScale = center.yScale - scaleRange;
          yScale <= center.yScale + scaleRange;
          yScale += steps.scale
        ) {
          const projection = { xOffset, yIntercept, yScale };
          const score = scoreProjection(png, projection);
          if (score > best.score) best = { ...projection, score };
        }
      }
    }
  };
  search(best, 70, 120, 2.2, { x: 5, intercept: 5, scale: 0.1 });
  const coarseBest = { ...best };
  search(coarseBest, 8, 10, 0.16, { x: 1, intercept: 1, scale: 0.02 });
  return best;
}

const idMap = PNG.sync.read(await readFile(idMapPath));
const projection = calibrateProjection(idMap);
const countryBounds = buildCountryBounds(idMap);
const reportEntries = CAPITALS.map((capital) => {
  const projected = project(capital, idMap, projection);
  const projectedX = Math.round(projected.x);
  const projectedY = Math.round(projected.y);
  const projectedPixelCountryId = decodeMapId(
    idMap.data,
    idMap.width,
    projectedX,
    projectedY,
  );
  const detectedCountryId = dominantMapId(idMap, projectedX, projectedY);
  // 주변 우세색뿐 아니라 마커 중심 픽셀도 실제 영토여야 한다. 해안선이나
  // 국경선 위에 걸린 좌표는 최근접 내부 픽셀로 옮겨 클릭/표시 판정을 일치시킨다.
  const directlyValid =
    detectedCountryId === capital.countryId &&
    projectedPixelCountryId === capital.countryId;
  const correction = directlyValid
    ? { x: projectedX, y: projectedY, distance: 0 }
    : findNearestCountryPixel(
      idMap,
      countryBounds,
      capital.countryId,
      projectedX,
      projectedY,
    );
  return {
    ...capital,
    projectedX,
    projectedY,
    projectedPixelCountryId,
    detectedCountryId,
    failureReason: directlyValid
      ? null
      : projectedPixelCountryId === 0
        ? "outside-country-mask:sea-or-unassigned"
        : projectedPixelCountryId !== capital.countryId
          ? `outside-country-mask:country-${String(projectedPixelCountryId).padStart(3, "0")}`
          : "outside-country-mask:border-or-antialiasing",
    corrected: !directlyValid && correction !== null,
    correctionDistance: correction?.distance ?? null,
    x: correction?.x ?? null,
    y: correction?.y ?? null,
    valid: correction !== null,
  };
});
const capitals = reportEntries.map((capital) => ({
  countryKey: capital.countryKey,
  name: capital.name,
  x: capital.valid ? capital.x : null,
  y: capital.valid ? capital.y : null,
  enabled: capital.valid,
}));
const invalid = reportEntries.filter((capital) => !capital.valid);

await writeFile(outputPath, `${JSON.stringify(capitals, null, 2)}\n`, "utf8");
await writeFile(
  reportPath,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    projection,
    validCount: reportEntries.length - invalid.length,
    invalidCount: invalid.length,
    invalid: invalid.map((capital) => ({
      countryKey: capital.countryKey,
      name: capital.name,
      latitude: capital.latitude,
      longitude: capital.longitude,
      projectedX: capital.projectedX,
      projectedY: capital.projectedY,
      projectedPixelCountryId: capital.projectedPixelCountryId,
      detectedCountryId: capital.detectedCountryId,
      failureReason: capital.failureReason,
    })),
    corrected: reportEntries.filter((capital) => capital.corrected).map((capital) => ({
      countryKey: capital.countryKey,
      name: capital.name,
      latitude: capital.latitude,
      longitude: capital.longitude,
      projected: { x: capital.projectedX, y: capital.projectedY },
      corrected: { x: capital.x, y: capital.y },
      correctionDistance: Number(capital.correctionDistance.toFixed(2)),
      failureReason: capital.failureReason,
    })),
    capitals: reportEntries,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`수도 좌표 생성: ${reportEntries.length - invalid.length}/${reportEntries.length}개 통과`);
console.log(`자동 내부 보정: ${reportEntries.filter((capital) => capital.corrected).length}개`);
console.log(
  `공통 투영식: xOffset=${projection.xOffset}, yIntercept=${projection.yIntercept}, yScale=${projection.yScale.toFixed(2)}`,
);
if (invalid.length > 0) {
  console.log("검증 실패 수도:");
  for (const capital of invalid) {
    console.log(
      `- ${capital.countryKey} ${capital.name}: 투영 (${capital.projectedX}, ${capital.projectedY}), 감지 ID=${capital.detectedCountryId}`,
    );
  }
}
