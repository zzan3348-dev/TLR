import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import {
  classifySourcePixels,
  createOwnershipPreview,
  generateCleanRasterLayers,
  restoreCleanOwnership,
} from "./clean-ownership.mjs";
import { mapColorConfig } from "./map-color-config.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const preferredSourcePath = path.join(
  projectRoot,
  "public",
  "maps",
  "world-1932-source.png",
);
const legacySourcePath = path.join(
  projectRoot,
  "public",
  "maps",
  "world-1932.png",
);
const generatedDirectory = process.env.MAP_GENERATION_OUTPUT_DIRECTORY
  ? path.resolve(process.env.MAP_GENERATION_OUTPUT_DIRECTORY)
  : path.join(projectRoot, "public", "maps", "generated");
const maskDirectory = path.join(generatedDirectory, "country-masks");
const labelEnvelopeDirectory = path.join(
  generatedDirectory,
  "label-envelopes",
);
const dataSourceDirectory = path.join(projectRoot, "src", "data");
const dataOutputDirectory = process.env.MAP_DATA_OUTPUT_DIRECTORY
  ? path.resolve(process.env.MAP_DATA_OUTPUT_DIRECTORY)
  : dataSourceDirectory;
const countriesReadPath = path.join(
  projectRoot,
  "src",
  "data",
  "mapCountries.json",
);
const countriesPath = path.join(dataOutputDirectory, "mapCountries.json");
const componentsPath = path.join(
  dataOutputDirectory,
  "mapCountryComponents.json",
);
const physicalComponentsPath = path.join(
  dataOutputDirectory,
  "mapCountryPhysicalComponents.json",
);
const labelsPath = path.join(
  dataOutputDirectory,
  "mapCountryLabels.json",
);
const displayGroupsPath = path.join(
  dataOutputDirectory,
  "mapCountryDisplayGroups.json",
);
const colorMigrationsPath = path.join(
  projectRoot,
  "src",
  "data",
  "mapColorMigrations.json",
);
const debugDirectory = path.join(generatedDirectory, "debug");

const confirmedCountryNames = new Map([
  [
    "#9B0900",
    {
      name: "우크라이나 농민연방공화국",
      shortName: "우크라이나",
      mapLabel: "우크라이나 농민연방공화국",
    },
  ],
  [
    "#B21F00",
    {
      name: "이탈리아 인민공화국",
      shortName: "이탈리아",
      mapLabel: "이탈리아 인민공화국",
    },
  ],
  [
    "#A86966",
    {
      name: "폴란드 사회민주공화국",
      shortName: "폴란드",
      mapLabel: "폴란드 사회민주공화국",
    },
  ],
]);

function applyColorMigrations(existingCountries, migrations) {
  const migrationBySource = new Map(
    migrations
      .filter(
        (migration) =>
          migration &&
          typeof migration.from === "string" &&
          typeof migration.to === "string",
      )
      .map((migration) => [
        migration.from.toUpperCase(),
        migration.to.toUpperCase(),
      ]),
  );
  return existingCountries.map((country) => {
    const migratedColor = migrationBySource.get(
      String(country.color).toUpperCase(),
    );
    return migratedColor ? { ...country, color: migratedColor } : country;
  });
}

function colorDistance(first, second) {
  return Math.hypot(
    first.r - second.r,
    first.g - second.g,
    first.b - second.b,
  );
}

function rgbToHex(color) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(hex) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);

  if (!match) {
    throw new Error(`잘못된 RGB HEX 값입니다: ${hex}`);
  }

  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function isLineColor(color) {
  const maximum = mapColorConfig.darkChannelMaximum;
  return color.r <= maximum && color.g <= maximum && color.b <= maximum;
}

function isSeaColor(color) {
  return (
    colorDistance(color, hexToRgb(mapColorConfig.seaColor)) <=
    mapColorConfig.seaTolerance
  );
}

function isExcludedMapColor(color) {
  if (color.a <= 10) {
    return true;
  }

  const minimum = mapColorConfig.whiteChannelMinimum;
  const isWhite =
    color.r >= minimum && color.g >= minimum && color.b >= minimum;
  return isLineColor(color) || isWhite || isSeaColor(color);
}

function clusterSimilarColors(colors) {
  const clusters = [];

  for (const color of colors) {
    const cluster = clusters.find(
      (candidate) =>
        colorDistance(candidate.representative, color) <=
        mapColorConfig.clusterDistance,
    );

    if (cluster) {
      cluster.colors.push(color);
      cluster.pixelCount += color.pixelCount;
      if (color.pixelCount > cluster.representative.pixelCount) {
        cluster.representative = color;
      }
    } else {
      clusters.push({
        representative: color,
        colors: [color],
        pixelCount: color.pixelCount,
      });
    }
  }

  return clusters;
}

function extractRepresentativeColors(png) {
  const frequencies = new Map();

  for (let index = 0; index < png.data.length; index += 4) {
    const color = {
      r: png.data[index],
      g: png.data[index + 1],
      b: png.data[index + 2],
      a: png.data[index + 3],
    };

    if (isExcludedMapColor(color)) {
      continue;
    }

    const hex = rgbToHex(color);
    const pixelIndex = index / 4;
    const existing = frequencies.get(hex);

    if (existing) {
      existing.pixelCount += 1;
    } else {
      frequencies.set(hex, {
        ...color,
        hex,
        pixelCount: 1,
        firstPixelIndex: pixelIndex,
      });
    }
  }

  const colors = [...frequencies.values()].sort(
    (first, second) =>
      second.pixelCount - first.pixelCount ||
      first.firstPixelIndex - second.firstPixelIndex,
  );
  const clusters = clusterSimilarColors(colors);
  const manualIncludes = new Set(
    mapColorConfig.manualIncludeColors.map((hex) => hex.toUpperCase()),
  );
  const manualExcludes = new Set(
    mapColorConfig.manualExcludeColors.map((hex) => hex.toUpperCase()),
  );
  const representatives = clusters
    .filter(
      (cluster) =>
        cluster.pixelCount >= mapColorConfig.minimumPixelCount ||
        cluster.colors.some((color) => manualIncludes.has(color.hex)),
    )
    .map((cluster) => {
      const manualRepresentative = cluster.colors.find((color) =>
        manualIncludes.has(color.hex),
      );
      return manualRepresentative ?? cluster.representative;
    })
    .filter((color) => !manualExcludes.has(color.hex));

  for (const hex of manualIncludes) {
    if (!representatives.some((color) => color.hex === hex)) {
      const color = hexToRgb(hex);
      representatives.push({
        ...color,
        a: 255,
        hex,
        pixelCount: frequencies.get(hex)?.pixelCount ?? 0,
        firstPixelIndex:
          frequencies.get(hex)?.firstPixelIndex ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return representatives.sort(
    (first, second) =>
      first.firstPixelIndex - second.firstPixelIndex ||
      first.hex.localeCompare(second.hex),
  );
}

async function readJsonArray(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

function assignStableIds(representatives, existingCountries) {
  const existingByColor = new Map(
    existingCountries.map((country) => [
      String(country.color).toUpperCase(),
      country,
    ]),
  );
  const manualExcludes = new Set(
    mapColorConfig.manualExcludeColors.map((hex) => hex.toUpperCase()),
  );
  const retained = existingCountries
    .filter(
      (country) => !manualExcludes.has(String(country.color).toUpperCase()),
    )
    .map((country) => ({
      id: Number(country.id),
      key: String(country.key),
      color: String(country.color).toUpperCase(),
      internalName:
        typeof country.internalName === "string"
          ? country.internalName
          : "",
      name: typeof country.name === "string" ? country.name : "",
      nativeName:
        typeof country.nativeName === "string" ? country.nativeName : "",
      shortName:
        typeof country.shortName === "string" ? country.shortName : "",
      mapLabel:
        typeof country.mapLabel === "string" ? country.mapLabel : "",
      shortLabel:
        typeof country.shortLabel === "string" ? country.shortLabel : "",
      allowShortMapLabel: country.allowShortMapLabel !== false,
      label: normalizeLabelSettings(country.label),
      labelRepeat: normalizeLabelRepeatSettings(country.labelRepeat),
      labelGroups: normalizeLabelGroups(country.labelGroups),
      grouping: normalizeGroupingSettings(country.grouping),
      flagPath:
        typeof country.flagPath === "string" ? country.flagPath : null,
      flagFit:
        country.flagFit === "contain" ||
        country.flagFit === "stretch" ||
        country.flagFit === "cover"
          ? country.flagFit
          : "cover",
      flagOpacity:
        typeof country.flagOpacity === "number" ? country.flagOpacity : 0.82,
      flagFocusMode:
        country.flagFocusMode === "selected-component" ||
        country.flagFocusMode === "all-territories"
          ? country.flagFocusMode
          : "selected-display-group",
      flagBlendMode:
        country.flagBlendMode === "multiply" ||
        country.flagBlendMode === "overlay" ||
        country.flagBlendMode === "soft-light"
          ? country.flagBlendMode
          : "source-over",
    }));
  let nextId = retained.reduce(
    (maximum, country) => Math.max(maximum, country.id || 0),
    0,
  );

  for (const representative of representatives) {
    const hex = representative.hex.toUpperCase();
    if (existingByColor.has(hex)) {
      continue;
    }

    nextId += 1;
    retained.push({
      id: nextId,
      key: `country-${String(nextId).padStart(3, "0")}`,
      color: hex,
      internalName: "",
      name: "",
      nativeName: "",
      shortName: "",
      mapLabel: "",
      shortLabel: "",
      allowShortMapLabel: true,
      label: normalizeLabelSettings(null),
      labelRepeat: normalizeLabelRepeatSettings(null),
      labelGroups: [],
      grouping: normalizeGroupingSettings(null),
      flagPath: null,
      flagFit: "cover",
      flagOpacity: 0.82,
      flagFocusMode: "selected-display-group",
      flagBlendMode: "source-over",
    });
  }

  for (const country of retained) {
    const confirmed = confirmedCountryNames.get(country.color);
    if (!confirmed) {
      continue;
    }
    country.name = confirmed.name;
    country.shortName = confirmed.shortName;
    country.mapLabel = confirmed.mapLabel;
    country.allowShortMapLabel = false;
  }

  const aragon = retained.find((country) => country.id === 30);
  if (aragon) {
    aragon.name = "아라곤 자유지대";
    aragon.shortName = "자유지대";
    aragon.mapLabel = "아라곤 자유지대";
  }

  const britain = retained.find((country) => country.id === 2);
  if (britain && britain.grouping.mode !== "manual") {
    britain.grouping = {
      ...britain.grouping,
      archipelagoMode: true,
      mergeDistance: 150,
      smallIslandMergeDistance: 230,
      largeOverseasSplitDistance: 280,
      labelEnvelopeBuffer: 18,
    };
  }

  const nusantara = retained.find((country) => country.id === 53);
  if (nusantara && nusantara.grouping.mode !== "manual") {
    nusantara.grouping = {
      ...nusantara.grouping,
      archipelagoMode: true,
      mergeDistance: 420,
      smallIslandMergeDistance: 240,
      largeOverseasSplitDistance: 760,
      labelEnvelopeBuffer: 48,
    };
  }

  return retained.sort((first, second) => first.id - second.id);
}

function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLabelSettings(label) {
  const source = label && typeof label === "object" ? label : {};
  const mode =
    source.mode === "manual" || source.mode === "hidden"
      ? source.mode
      : "auto";
  return {
    enabled: source.enabled !== false,
    componentId:
      typeof source.componentId === "string" ? source.componentId : null,
    mode,
    text: typeof source.text === "string" ? source.text : null,
    x: nullableNumber(source.x),
    y: nullableNumber(source.y),
    angle: nullableNumber(source.angle),
    fontSize: nullableNumber(source.fontSize),
    letterSpacing: nullableNumber(source.letterSpacing),
    minZoom: nullableNumber(source.minZoom),
    priority: nullableNumber(source.priority),
  };
}

function normalizeLabelRepeatSettings(value) {
  const defaults = mapColorConfig.labelRepeat;
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: source.enabled !== false,
    minimumPixelArea:
      nullableNumber(source.minimumPixelArea) ?? defaults.minimumPixelArea,
    minimumRelativeArea:
      nullableNumber(source.minimumRelativeArea) ??
      defaults.minimumRelativeArea,
    minimumBoundsWidth:
      nullableNumber(source.minimumBoundsWidth) ?? defaults.minimumBoundsWidth,
    minimumBoundsHeight:
      nullableNumber(source.minimumBoundsHeight) ??
      defaults.minimumBoundsHeight,
    maxAutomaticLabels:
      nullableNumber(source.maxAutomaticLabels) ??
      defaults.maxAutomaticLabels,
  };
}

function normalizeGroupingSettings(value) {
  const defaults = mapColorConfig.groupingDefaults;
  const source = value && typeof value === "object" ? value : {};
  const manualGroups = Array.isArray(source.manualGroups)
    ? source.manualGroups
        .filter((group) => group && typeof group === "object")
        .map((group, index) => ({
          id:
            typeof group.id === "string" && group.id.trim()
              ? group.id
              : `manual-display-group-${String(index + 1).padStart(2, "0")}`,
          physicalComponentIds: Array.isArray(group.physicalComponentIds)
            ? group.physicalComponentIds.filter(
                (componentId) => typeof componentId === "string",
              )
            : [],
        }))
    : defaults.manualGroups;
  return {
    mode: source.mode === "manual" ? "manual" : "auto",
    archipelagoMode: source.archipelagoMode === true,
    mergeDistance:
      nullableNumber(source.mergeDistance) ?? defaults.mergeDistance,
    smallIslandMergeDistance:
      nullableNumber(source.smallIslandMergeDistance) ??
      defaults.smallIslandMergeDistance,
    largeOverseasSplitDistance:
      nullableNumber(source.largeOverseasSplitDistance) ??
      defaults.largeOverseasSplitDistance,
    labelEnvelopeBuffer:
      nullableNumber(source.labelEnvelopeBuffer) ??
      defaults.labelEnvelopeBuffer,
    manualGroups,
    excludedPhysicalComponentIds: Array.isArray(
      source.excludedPhysicalComponentIds,
    )
      ? source.excludedPhysicalComponentIds.filter(
          (componentId) => typeof componentId === "string",
        )
      : defaults.excludedPhysicalComponentIds,
  };
}

function normalizeLabelGroups(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((group) => group && typeof group === "object")
    .map((group, index) => ({
      id:
        typeof group.id === "string" && group.id.trim()
          ? group.id
          : `manual-group-${String(index + 1).padStart(2, "0")}`,
      mode:
        group.mode === "manual" || group.mode === "hidden"
          ? group.mode
          : "auto",
      componentIds: Array.isArray(group.componentIds)
        ? group.componentIds.filter((id) => typeof id === "string")
        : [],
      enabled: group.enabled !== false,
      text:
        typeof group.text === "string"
          ? group.text
          : typeof group.mapLabel === "string"
            ? group.mapLabel
            : null,
      layoutMode:
        group.layoutMode === "straight" ||
        group.layoutMode === "arc-up" ||
        group.layoutMode === "arc-down"
          ? group.layoutMode
          : null,
      x: nullableNumber(group.x),
      y: nullableNumber(group.y),
      angle: nullableNumber(group.angle),
      curvature: nullableNumber(group.curvature),
      fontSize: nullableNumber(group.fontSize),
      letterSpacing: nullableNumber(group.letterSpacing),
      minZoom: nullableNumber(group.minZoom),
      priority: nullableNumber(group.priority),
      start:
        group.start &&
        typeof group.start.x === "number" &&
        typeof group.start.y === "number"
          ? { x: group.start.x, y: group.start.y }
          : null,
      control:
        group.control &&
        typeof group.control.x === "number" &&
        typeof group.control.y === "number"
          ? { x: group.control.x, y: group.control.y }
          : null,
      end:
        group.end &&
        typeof group.end.x === "number" &&
        typeof group.end.y === "number"
          ? { x: group.end.x, y: group.end.y }
          : null,
    }));
}

function nearestCountryId(color, countries) {
  let nearestId = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const country of countries) {
    const distance = colorDistance(color, hexToRgb(country.color));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = country.id;
    }
  }

  return nearestDistance <= mapColorConfig.countryMatchTolerance
    ? nearestId
    : 0;
}

function isPointInAreas(x, y, areas) {
  return areas.some(
    (area) =>
      x >= area.x &&
      y >= area.y &&
      x < area.x + area.width &&
      y < area.y + area.height,
  );
}

// 기존 보고서와 이전 에셋 형식을 비교할 때만 참고하는 레거시 분류기다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildPixelClassification(source, countries) {
  const { width, height, data } = source;
  const pixelCount = width * height;
  const rawCountryIds = new Uint16Array(pixelCount);
  const linePixels = new Uint8Array(pixelCount);
  const seaPixels = new Uint8Array(pixelCount);
  const paletteCountryIds = new Map();

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    const color = {
      r: data[dataIndex],
      g: data[dataIndex + 1],
      b: data[dataIndex + 2],
      a: data[dataIndex + 3],
    };
    const hex = rgbToHex(color);

    if (isLineColor(color)) {
      linePixels[pixelIndex] = 1;
      continue;
    }
    if (isSeaColor(color)) {
      seaPixels[pixelIndex] = 1;
      continue;
    }

    let countryId = paletteCountryIds.get(hex);
    if (countryId === undefined) {
      countryId = nearestCountryId(color, countries);
      paletteCountryIds.set(hex, countryId);
    }
    rawCountryIds[pixelIndex] = countryId;
  }

  return { rawCountryIds, linePixels, seaPixels };
}

function inspectLineNeighborhood(
  x,
  y,
  width,
  height,
  countryIds,
  seaPixels,
) {
  let firstCountryId = 0;
  let hasMultipleCountries = false;
  let hasSea = false;
  let nearestPixelIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let radius = 1; radius <= mapColorConfig.lineSearchRadius; radius += 1) {
    for (let offset = -radius; offset <= radius; offset += 1) {
      const points =
        Math.abs(offset) === radius
          ? [
              [x + offset, y - radius],
              [x + offset, y + radius],
            ]
          : [
              [x - radius, y + offset],
              [x + radius, y + offset],
            ];

      for (const [candidateX, candidateY] of points) {
        if (
          candidateX < 0 ||
          candidateY < 0 ||
          candidateX >= width ||
          candidateY >= height
        ) {
          continue;
        }

        const pixelIndex = candidateY * width + candidateX;
        const countryId = countryIds[pixelIndex];
        if (countryId > 0) {
          if (firstCountryId === 0) {
            firstCountryId = countryId;
          } else if (firstCountryId !== countryId) {
            hasMultipleCountries = true;
          }
        }
        if (seaPixels[pixelIndex] === 1) {
          hasSea = true;
        }

        if ((countryId > 0 || seaPixels[pixelIndex] === 1) && radius < nearestDistance) {
          nearestDistance = radius;
          nearestPixelIndex = pixelIndex;
        }
      }
    }
  }

  return {
    firstCountryId,
    hasMultipleCountries,
    hasSea,
    nearestPixelIndex,
  };
}

function createPng(width, height) {
  return new PNG({ width, height, colorType: 6 });
}

function setPixel(png, pixelIndex, color, alpha = 255) {
  const offset = pixelIndex * 4;
  png.data[offset] = color.r;
  png.data[offset + 1] = color.g;
  png.data[offset + 2] = color.b;
  png.data[offset + 3] = alpha;
}

function copyPixel(sourceData, sourcePixelIndex, targetData, targetPixelIndex) {
  const sourceOffset = sourcePixelIndex * 4;
  const targetOffset = targetPixelIndex * 4;
  targetData[targetOffset] = sourceData[sourceOffset];
  targetData[targetOffset + 1] = sourceData[sourceOffset + 1];
  targetData[targetOffset + 2] = sourceData[sourceOffset + 2];
  targetData[targetOffset + 3] = sourceData[sourceOffset + 3];
}

// clean ownership 전환 전 결과와 회귀 비교하기 위해 남겨 둔 레거시 생성기다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateRasterLayers(source, classification) {
  const { width, height, data } = source;
  const { rawCountryIds, linePixels, seaPixels } = classification;
  const territoryIds = rawCountryIds.slice();
  const fill = createPng(width, height);
  const provinceLines = createPng(width, height);
  const countryLines = createPng(width, height);
  const countries = createPng(width, height);
  const pixelCount = width * height;
  let internalLinePixels = 0;
  let retainedLinePixels = 0;
  let ambiguousLinePixels = 0;
  const ambiguousLineSamples = [];
  const sampledRegions = new Set();

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (linePixels[pixelIndex] === 0) {
      copyPixel(data, pixelIndex, fill.data, pixelIndex);
      continue;
    }

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const neighborhood = inspectLineNeighborhood(
      x,
      y,
      width,
      height,
      rawCountryIds,
      seaPixels,
    );
    const forcedCountryLine = isPointInAreas(
      x,
      y,
      mapColorConfig.forceCountryLineAreas,
    );
    const forcedProvinceFill = isPointInAreas(
      x,
      y,
      mapColorConfig.forceProvinceFillAreas,
    );
    const isInternalLine =
      forcedProvinceFill ||
      (!forcedCountryLine &&
        neighborhood.firstCountryId > 0 &&
        !neighborhood.hasMultipleCountries &&
        !neighborhood.hasSea);

    if (isInternalLine) {
      territoryIds[pixelIndex] = neighborhood.firstCountryId;
      internalLinePixels += 1;
    } else {
      retainedLinePixels += 1;
      copyPixel(data, pixelIndex, countryLines.data, pixelIndex);
      if (
        neighborhood.firstCountryId === 0 &&
        !neighborhood.hasSea &&
        ambiguousLineSamples.length < 40
      ) {
        ambiguousLinePixels += 1;
        const regionKey = `${Math.floor(x / 192)}:${Math.floor(y / 192)}`;
        if (!sampledRegions.has(regionKey)) {
          sampledRegions.add(regionKey);
          ambiguousLineSamples.push({ x, y });
        }
      } else if (
        neighborhood.firstCountryId === 0 &&
        !neighborhood.hasSea
      ) {
        ambiguousLinePixels += 1;
      }
    }

    copyPixel(data, pixelIndex, provinceLines.data, pixelIndex);

    if (neighborhood.nearestPixelIndex >= 0) {
      copyPixel(
        data,
        neighborhood.nearestPixelIndex,
        fill.data,
        pixelIndex,
      );
    } else {
      const sea = hexToRgb(mapColorConfig.seaColor);
      const offset = pixelIndex * 4;
      fill.data[offset] = sea.r;
      fill.data[offset + 1] = sea.g;
      fill.data[offset + 2] = sea.b;
      fill.data[offset + 3] = 255;
    }
  }

  countries.data.set(fill.data);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (countryLines.data[pixelIndex * 4 + 3] > 0) {
      copyPixel(
        countryLines.data,
        pixelIndex,
        countries.data,
        pixelIndex,
      );
    }
  }

  const idMap = createPng(width, height);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const id = territoryIds[pixelIndex];
    const offset = pixelIndex * 4;
    idMap.data[offset] = id & 255;
    idMap.data[offset + 1] = (id >> 8) & 255;
    idMap.data[offset + 2] = (id >> 16) & 255;
    idMap.data[offset + 3] = 255;
  }

  return {
    territoryIds,
    fill,
    provinceLines,
    countryLines,
    countries,
    idMap,
    internalLinePixels,
    retainedLinePixels,
    ambiguousLinePixels,
    ambiguousLineSamples,
  };
}

function analyzeRawComponents(territoryIds, width, height) {
  const labels = new Int32Array(width * height);
  const components = [];
  let nextLabel = 0;

  for (let start = 0; start < territoryIds.length; start += 1) {
    const countryId = territoryIds[start];
    if (countryId === 0 || labels[start] !== 0) {
      continue;
    }

    nextLabel += 1;
    const startX = start % width;
    const startY = Math.floor(start / width);
    const queueIndices = [start];
    const queueVirtualX = [startX];
    labels[start] = nextLabel;
    let cursor = 0;
    let minVirtualX = startX;
    let maxVirtualX = startX;
    let minY = startY;
    let maxY = startY;
    let sumVirtualX = 0;
    let sumY = 0;
    let pixelCount = 0;

    while (cursor < queueIndices.length) {
      const pixelIndex = queueIndices[cursor];
      const virtualX = queueVirtualX[cursor];
      cursor += 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      pixelCount += 1;
      sumVirtualX += virtualX;
      sumY += y;
      minVirtualX = Math.min(minVirtualX, virtualX);
      maxVirtualX = Math.max(maxVirtualX, virtualX);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      const neighbors = [
        [modulo(x - 1, width), y, virtualX - 1],
        [modulo(x + 1, width), y, virtualX + 1],
        [x, y - 1, virtualX],
        [x, y + 1, virtualX],
        [modulo(x - 1, width), y - 1, virtualX - 1],
        [modulo(x + 1, width), y - 1, virtualX + 1],
        [modulo(x - 1, width), y + 1, virtualX - 1],
        [modulo(x + 1, width), y + 1, virtualX + 1],
      ];

      for (const [neighborX, neighborY, neighborVirtualX] of neighbors) {
        if (neighborY < 0 || neighborY >= height) {
          continue;
        }
        const neighborIndex = neighborY * width + neighborX;
        if (
          labels[neighborIndex] !== 0 ||
          territoryIds[neighborIndex] !== countryId
        ) {
          continue;
        }
        labels[neighborIndex] = nextLabel;
        queueIndices.push(neighborIndex);
        queueVirtualX.push(neighborVirtualX);
      }
    }

    const normalizedX = modulo(minVirtualX, width);
    const xShift = normalizedX - minVirtualX;
    components.push({
      label: nextLabel,
      countryId,
      pixelCount,
      firstPixelIndex: start,
      minX: normalizedX,
      maxX: normalizedX + (maxVirtualX - minVirtualX),
      minY,
      maxY,
      centroidX: sumVirtualX / pixelCount + xShift,
      centroidY: sumY / pixelCount,
      representative: { x: startX, y: startY },
    });
  }

  return { labels, components };
}

function wrappedDistance(firstX, firstY, secondX, secondY, width) {
  const directX = Math.abs(firstX - secondX);
  const deltaX = Math.min(directX, width - Math.min(directX, width));
  return Math.hypot(deltaX, firstY - secondY);
}

function shiftNear(value, target, width) {
  const candidates = [value - width, value, value + width];
  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - target) < Math.abs(nearest - target)
      ? candidate
      : nearest,
  );
}

function physicalComponentId(component) {
  return (
    `country-${String(component.countryId).padStart(3, "0")}` +
    `-physical-${String(component.label).padStart(5, "0")}`
  );
}

function resolveAutomaticArchipelagoGrouping(
  countryComponents,
  grouping,
  width,
) {
  if (
    grouping.mode === "manual" ||
    grouping.archipelagoMode ||
    countryComponents.length < 3
  ) {
    return {
      enabled: grouping.archipelagoMode,
      mergeDistance: grouping.mergeDistance,
      smallIslandMergeDistance: grouping.smallIslandMergeDistance,
    };
  }
  const significant = [...countryComponents]
    .filter((component) => component.pixelCount >= 64)
    .sort((first, second) => second.pixelCount - first.pixelCount)
    .slice(0, 16);
  if (significant.length < 2) {
    return {
      enabled: false,
      mergeDistance: grouping.mergeDistance,
      smallIslandMergeDistance: grouping.smallIslandMergeDistance,
    };
  }
  const significantPixels = significant.reduce(
    (sum, component) => sum + component.pixelCount,
    0,
  );
  const adaptiveDistance = Math.max(
    grouping.mergeDistance,
    Math.min(260, Math.sqrt(significantPixels) * 1.65),
  );
  let compactPairCount = 0;
  for (let firstIndex = 0; firstIndex < significant.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < significant.length;
      secondIndex += 1
    ) {
      const first = significant[firstIndex];
      const second = significant[secondIndex];
      if (
        wrappedDistance(
          first.centroidX,
          first.centroidY,
          second.centroidX,
          second.centroidY,
          width,
        ) <= adaptiveDistance
      ) {
        compactPairCount += 1;
      }
    }
  }
  return {
    enabled: compactPairCount > 0,
    mergeDistance: adaptiveDistance,
    smallIslandMergeDistance: Math.max(
      grouping.smallIslandMergeDistance,
      Math.min(320, adaptiveDistance + 55),
    ),
  };
}

function groupSmallComponents(rawComponents, width, countries) {
  const byCountry = new Map();
  const countryById = new Map(
    countries.map((country) => [country.id, country]),
  );
  for (const component of rawComponents) {
    const list = byCountry.get(component.countryId) ?? [];
    list.push(component);
    byCountry.set(component.countryId, list);
  }

  const groups = [];
  for (const [countryId, countryComponents] of byCountry) {
    const grouping =
      countryById.get(countryId)?.grouping ??
      normalizeGroupingSettings(null);
    const automaticArchipelago = resolveAutomaticArchipelagoGrouping(
      countryComponents,
      grouping,
      width,
    );
    const effectiveGrouping = {
      ...grouping,
      archipelagoMode: automaticArchipelago.enabled,
      mergeDistance: automaticArchipelago.mergeDistance,
      smallIslandMergeDistance:
        automaticArchipelago.smallIslandMergeDistance,
    };
    const excluded = new Set(grouping.excludedPhysicalComponentIds);
    const manualGroupByComponent = new Map();
    for (const manualGroup of grouping.manualGroups) {
      for (const componentId of manualGroup.physicalComponentIds) {
        manualGroupByComponent.set(componentId, manualGroup.id);
      }
    }
    const sorted = [...countryComponents].sort(
      (first, second) =>
        second.pixelCount - first.pixelCount ||
        first.firstPixelIndex - second.firstPixelIndex,
    );
    const countryGroups = [];

    for (const component of sorted) {
      let targetGroup = null;
      const componentPhysicalId = physicalComponentId(component);
      const manualGroupId = manualGroupByComponent.get(componentPhysicalId);
      if (manualGroupId) {
        targetGroup = countryGroups.find(
          (group) => group.manualGroupId === manualGroupId,
        );
      } else if (
        !excluded.has(componentPhysicalId) &&
        (effectiveGrouping.archipelagoMode ||
          component.pixelCount < mapColorConfig.componentSeedPixelCount)
      ) {
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const group of countryGroups) {
          if (group.manualGroupId) {
            continue;
          }
          const distance = Math.min(
            ...group.members.map((member) =>
              wrappedDistance(
                component.centroidX,
                component.centroidY,
                member.centroidX,
                member.centroidY,
                width,
              ),
            ),
          );
          const smallIsland =
            component.pixelCount <
              mapColorConfig.labelRepeat.minimumPixelArea ||
            group.pixelCount <
              mapColorConfig.labelRepeat.minimumPixelArea;
          const mergeDistance = effectiveGrouping.archipelagoMode
            ? smallIsland
              ? effectiveGrouping.smallIslandMergeDistance
              : effectiveGrouping.mergeDistance
            : mapColorConfig.componentGroupingDistance;
          const allowedDistance = Math.min(
            mergeDistance,
            effectiveGrouping.largeOverseasSplitDistance,
          );
          if (
            distance <= allowedDistance &&
            distance < nearestDistance
          ) {
            nearestDistance = distance;
            targetGroup = group;
          }
        }
      }

      if (!targetGroup) {
        countryGroups.push({
          countryId,
          members: [component],
          pixelCount: component.pixelCount,
          minX: component.minX,
          maxX: component.maxX,
          minY: component.minY,
          maxY: component.maxY,
          centroidX: component.centroidX,
          centroidY: component.centroidY,
          firstPixelIndex: component.firstPixelIndex,
          representative: component.representative,
          manualGroupId: manualGroupId ?? null,
          archipelago: false,
          grouping: effectiveGrouping,
        });
        continue;
      }

      const shiftedCentroidX = shiftNear(
        component.centroidX,
        targetGroup.centroidX,
        width,
      );
      const shift = shiftedCentroidX - component.centroidX;
      const combinedPixels = targetGroup.pixelCount + component.pixelCount;
      targetGroup.members.push(component);
      targetGroup.minX = Math.min(targetGroup.minX, component.minX + shift);
      targetGroup.maxX = Math.max(targetGroup.maxX, component.maxX + shift);
      targetGroup.minY = Math.min(targetGroup.minY, component.minY);
      targetGroup.maxY = Math.max(targetGroup.maxY, component.maxY);
      targetGroup.centroidX =
        (targetGroup.centroidX * targetGroup.pixelCount +
          shiftedCentroidX * component.pixelCount) /
        combinedPixels;
      targetGroup.centroidY =
        (targetGroup.centroidY * targetGroup.pixelCount +
          component.centroidY * component.pixelCount) /
        combinedPixels;
      targetGroup.pixelCount = combinedPixels;
      targetGroup.firstPixelIndex = Math.min(
        targetGroup.firstPixelIndex,
        component.firstPixelIndex,
      );
      targetGroup.archipelago =
        effectiveGrouping.archipelagoMode &&
        targetGroup.members.length > 1;
    }
    groups.push(...countryGroups);
  }

  return groups.sort(
    (first, second) =>
      first.countryId - second.countryId ||
      first.firstPixelIndex - second.firstPixelIndex,
  );
}

async function generateComponentMasks(
  labels,
  groups,
  width,
  height,
) {
  await rm(maskDirectory, { recursive: true, force: true });
  await rm(labelEnvelopeDirectory, { recursive: true, force: true });
  await mkdir(maskDirectory, { recursive: true });
  await mkdir(labelEnvelopeDirectory, { recursive: true });
  const labelToGroup = new Int32Array(
    groups.reduce(
      (maximum, group) =>
        Math.max(
          maximum,
          ...group.members.map((component) => component.label),
        ),
      0,
    ) + 1,
  );
  groups.forEach((group, groupIndex) => {
    for (const member of group.members) {
      labelToGroup[member.label] = groupIndex + 1;
    }
  });

  const countrySequence = new Map();
  const metadata = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const sequence = (countrySequence.get(group.countryId) ?? 0) + 1;
    countrySequence.set(group.countryId, sequence);
    const normalizedX = modulo(Math.floor(group.minX), width);
    const xShift = normalizedX - group.minX;
    const bounds = {
      x: normalizedX,
      y: group.minY,
      width: Math.round(group.maxX - group.minX + 1),
      height: group.maxY - group.minY + 1,
    };
    const componentId = `country-${String(group.countryId).padStart(
      3,
      "0",
    )}-component-${String(sequence).padStart(3, "0")}`;
    const fileName = `${componentId}.png`;
    const mask = createPng(bounds.width, bounds.height);

    for (let localY = 0; localY < bounds.height; localY += 1) {
      const sourceY = bounds.y + localY;
      if (sourceY < 0 || sourceY >= height) {
        continue;
      }
      for (let localX = 0; localX < bounds.width; localX += 1) {
        const sourceX = modulo(bounds.x + localX, width);
        const sourceIndex = sourceY * width + sourceX;
        const label = labels[sourceIndex];
        if (labelToGroup[label] !== groupIndex + 1) {
          continue;
        }
        const targetOffset = (localY * bounds.width + localX) * 4;
        mask.data[targetOffset] = 255;
        mask.data[targetOffset + 1] = 255;
        mask.data[targetOffset + 2] = 255;
        mask.data[targetOffset + 3] = 255;
      }
    }

    await writeFile(
      path.join(maskDirectory, fileName),
      PNG.sync.write(mask),
    );
    const envelopeBuffer =
      group.archipelago || group.grouping.labelEnvelopeBuffer > 0
        ? Math.max(
            1,
            Math.round(
              group.grouping.labelEnvelopeBuffer ||
                Math.min(bounds.width, bounds.height) * 0.14,
            ),
          )
        : 0;
    const labelEnvelope =
      envelopeBuffer > 0
        ? createBufferedLabelEnvelope(mask, envelopeBuffer)
        : null;
    const envelopeFileName = `${componentId}-label-envelope.png`;
    if (labelEnvelope) {
      await writeFile(
        path.join(labelEnvelopeDirectory, envelopeFileName),
        PNG.sync.write(labelEnvelope),
      );
    }
    const defaultDisplayGroupId = componentId.replace(
      "-component-",
      "-group-",
    );
    metadata.push({
      countryId: group.countryId,
      componentId,
      displayGroupId: group.manualGroupId ?? defaultDisplayGroupId,
      physicalComponentIds: group.members.map(
        (member) =>
          `country-${String(group.countryId).padStart(3, "0")}-physical-${String(member.label).padStart(5, "0")}`,
      ),
      bounds,
      centroid: {
        x: group.centroidX + xShift,
        y: group.centroidY,
      },
      pixelCount: group.pixelCount,
      representative: group.representative,
      maskPath: `/maps/generated/country-masks/${fileName}`,
      labelEnvelopePath: labelEnvelope
        ? `/maps/generated/label-envelopes/${envelopeFileName}`
        : null,
      labelEnvelopeBuffer: envelopeBuffer,
      archipelago: group.archipelago,
      wrapsX: bounds.x + bounds.width > width,
      groupedTerritoryCount: group.members.length,
    });
  }

  return metadata;
}

function createBufferedLabelEnvelope(mask, radius) {
  const { width, height } = mask;
  const distances = new Float32Array(width * height);
  const diagonal = Math.SQRT2;
  for (let index = 0; index < distances.length; index += 1) {
    distances[index] = mask.data[index * 4 + 3] > 10 ? 0 : 1e6;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let distance = distances[index];
      if (x > 0) {
        distance = Math.min(distance, distances[index - 1] + 1);
      }
      if (y > 0) {
        distance = Math.min(distance, distances[index - width] + 1);
        if (x > 0) {
          distance = Math.min(
            distance,
            distances[index - width - 1] + diagonal,
          );
        }
        if (x + 1 < width) {
          distance = Math.min(
            distance,
            distances[index - width + 1] + diagonal,
          );
        }
      }
      distances[index] = distance;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let distance = distances[index];
      if (x + 1 < width) {
        distance = Math.min(distance, distances[index + 1] + 1);
      }
      if (y + 1 < height) {
        distance = Math.min(distance, distances[index + width] + 1);
        if (x > 0) {
          distance = Math.min(
            distance,
            distances[index + width - 1] + diagonal,
          );
        }
        if (x + 1 < width) {
          distance = Math.min(
            distance,
            distances[index + width + 1] + diagonal,
          );
        }
      }
      distances[index] = distance;
    }
  }
  const envelope = createPng(width, height);
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] > radius) {
      continue;
    }
    const offset = index * 4;
    envelope.data[offset] = 255;
    envelope.data[offset + 1] = 255;
    envelope.data[offset + 2] = 255;
    envelope.data[offset + 3] = 255;
  }
  return envelope;
}

function loadComponentMask(component) {
  return readFile(path.join(maskDirectory, path.basename(component.maskPath))).then((buffer) =>
    PNG.sync.read(buffer),
  );
}

function loadLabelFitMask(component) {
  const maskPath = component.labelEnvelopePath ?? component.maskPath;
  const directory = component.labelEnvelopePath
    ? labelEnvelopeDirectory
    : maskDirectory;
  return readFile(path.join(directory, path.basename(maskPath))).then(
    (buffer) => PNG.sync.read(buffer),
  );
}

function buildDistanceTransform(mask) {
  const { width, height, data } = mask;
  const distances = new Float32Array(width * height);
  const diagonal = Math.SQRT2;

  for (let index = 0; index < distances.length; index += 1) {
    distances[index] = data[index * 4 + 3] > 10 ? 1e6 : 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distances[index] === 0) {
        continue;
      }
      let distance = distances[index];
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        distance = 1;
      }
      if (x > 0) {
        distance = Math.min(distance, distances[index - 1] + 1);
      }
      if (y > 0) {
        distance = Math.min(distance, distances[index - width] + 1);
        if (x > 0) {
          distance = Math.min(
            distance,
            distances[index - width - 1] + diagonal,
          );
        }
        if (x + 1 < width) {
          distance = Math.min(
            distance,
            distances[index - width + 1] + diagonal,
          );
        }
      }
      distances[index] = distance;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distances[index] === 0) {
        continue;
      }
      let distance = distances[index];
      if (x + 1 < width) {
        distance = Math.min(distance, distances[index + 1] + 1);
      }
      if (y + 1 < height) {
        distance = Math.min(distance, distances[index + width] + 1);
        if (x > 0) {
          distance = Math.min(
            distance,
            distances[index + width - 1] + diagonal,
          );
        }
        if (x + 1 < width) {
          distance = Math.min(
            distance,
            distances[index + width + 1] + diagonal,
          );
        }
      }
      distances[index] = distance;
    }
  }

  return distances;
}

function isCoreMaskPixel(mask, x, y) {
  if (mask.data[(y * mask.width + x) * 4 + 3] <= 10) {
    return false;
  }
  let occupiedNeighbors = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (
        neighborX >= 0 &&
        neighborY >= 0 &&
        neighborX < mask.width &&
        neighborY < mask.height &&
        mask.data[(neighborY * mask.width + neighborX) * 4 + 3] > 10
      ) {
        occupiedNeighbors += 1;
      }
    }
  }
  return occupiedNeighbors >= 5;
}

function analyzeMaskAxis(mask) {
  const samplingStep = Math.max(
    1,
    Math.floor(Math.sqrt((mask.width * mask.height) / 60000)),
  );
  const points = [];
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < mask.height; y += samplingStep) {
    for (let x = 0; x < mask.width; x += samplingStep) {
      if (!isCoreMaskPixel(mask, x, y)) {
        continue;
      }
      points.push({ x, y });
      sumX += x;
      sumY += y;
    }
  }

  if (points.length === 0) {
    return {
      centroid: { x: mask.width / 2, y: mask.height / 2 },
      angle: 0,
      axisLength: mask.width,
      crossWidth: mask.height,
      aspectRatio: mask.width / Math.max(1, mask.height),
      upperSpace: mask.height / 2,
      lowerSpace: mask.height / 2,
    };
  }

  const centroid = {
    x: sumX / points.length,
    y: sumY / points.length,
  };
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;
  for (const point of points) {
    const deltaX = point.x - centroid.x;
    const deltaY = point.y - centroid.y;
    covarianceXX += deltaX * deltaX;
    covarianceYY += deltaY * deltaY;
    covarianceXY += deltaX * deltaY;
  }
  covarianceXX /= points.length;
  covarianceYY /= points.length;
  covarianceXY /= points.length;
  let angle =
    (0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY) * 180) /
    Math.PI;
  while (angle > 90) {
    angle -= 180;
  }
  while (angle < -90) {
    angle += 180;
  }

  const radians = (angle * Math.PI) / 180;
  const axisX = Math.cos(radians);
  const axisY = Math.sin(radians);
  const crossX = -axisY;
  const crossY = axisX;
  let minimumAxis = Number.POSITIVE_INFINITY;
  let maximumAxis = Number.NEGATIVE_INFINITY;
  let minimumCross = Number.POSITIVE_INFINITY;
  let maximumCross = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const relativeX = point.x - centroid.x;
    const relativeY = point.y - centroid.y;
    const projectedAxis = relativeX * axisX + relativeY * axisY;
    const projectedCross = relativeX * crossX + relativeY * crossY;
    minimumAxis = Math.min(minimumAxis, projectedAxis);
    maximumAxis = Math.max(maximumAxis, projectedAxis);
    minimumCross = Math.min(minimumCross, projectedCross);
    maximumCross = Math.max(maximumCross, projectedCross);
  }
  const axisLength = maximumAxis - minimumAxis;
  const crossWidth = maximumCross - minimumCross;
  const aspectRatio = axisLength / Math.max(1, crossWidth);
  const angleLimit = aspectRatio >= 4.2 ? 60 : 35;

  return {
    centroid,
    angle: Math.max(-angleLimit, Math.min(angleLimit, angle)),
    axisLength,
    crossWidth,
    aspectRatio,
    upperSpace: Math.max(0, -minimumCross),
    lowerSpace: Math.max(0, maximumCross),
  };
}

function findInteriorCandidates(mask, distances, centroid) {
  let maximumDistance = 0;
  for (const distance of distances) {
    maximumDistance = Math.max(maximumDistance, distance);
  }
  const candidates = [];
  const minimumSeparation = Math.max(
    4,
    Math.min(mask.width, mask.height) * 0.08,
  );
  const step = Math.max(
    1,
    Math.floor(Math.sqrt((mask.width * mask.height) / 90000)),
  );

  for (let y = 0; y < mask.height; y += step) {
    for (let x = 0; x < mask.width; x += step) {
      const distance = distances[y * mask.width + x];
      if (distance < maximumDistance * 0.48) {
        continue;
      }
      const score =
        distance - Math.hypot(x - centroid.x, y - centroid.y) * 0.002;
      if (
        candidates.some(
          (candidate) =>
            Math.hypot(candidate.x - x, candidate.y - y) < minimumSeparation,
        )
      ) {
        continue;
      }
      candidates.push({ x, y, score });
      candidates.sort((first, second) => second.score - first.score);
      if (candidates.length > 8) {
        candidates.pop();
      }
    }
  }

  if (candidates.length === 0) {
    let nearest = null;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (mask.data[(y * mask.width + x) * 4 + 3] <= 10) {
          continue;
        }
        const distance = Math.hypot(x - centroid.x, y - centroid.y);
        if (!nearest || distance < nearest.distance) {
          nearest = { x, y, distance };
        }
      }
    }
    if (nearest) {
      candidates.push({ x: nearest.x, y: nearest.y, score: 0 });
    }
  }

  return candidates;
}

function renderTextMask(text, fontSize, letterSpacing, angle) {
  const measureCanvas = createCanvas(16, 16);
  const measureContext = measureCanvas.getContext("2d");
  measureContext.font = `700 ${fontSize}px "Batang", "Noto Serif CJK KR", serif`;
  const characters = [...text];
  const widths = characters.map((character) =>
    Math.max(fontSize * 0.42, measureContext.measureText(character).width),
  );
  const textWidth =
    widths.reduce((total, width) => total + width, 0) +
    Math.max(0, characters.length - 1) * letterSpacing;
  const textHeight = fontSize * 1.45;
  const radians = (angle * Math.PI) / 180;
  const canvasWidth = Math.max(
    1,
    Math.ceil(
      Math.abs(textWidth * Math.cos(radians)) +
        Math.abs(textHeight * Math.sin(radians)) +
        8,
    ),
  );
  const canvasHeight = Math.max(
    1,
    Math.ceil(
      Math.abs(textWidth * Math.sin(radians)) +
        Math.abs(textHeight * Math.cos(radians)) +
        8,
    ),
  );
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate(radians);
  context.font = `700 ${fontSize}px "Batang", "Noto Serif CJK KR", serif`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillStyle = "#FFFFFF";
  let cursorX = -textWidth / 2;
  for (let index = 0; index < characters.length; index += 1) {
    context.fillText(characters[index], cursorX, 0);
    cursorX += widths[index] + letterSpacing;
  }

  return {
    width: canvasWidth,
    height: canvasHeight,
    textWidth,
    data: context.getImageData(0, 0, canvasWidth, canvasHeight).data,
  };
}

function measureTextMaskFit(mask, textMask, center) {
  const startX = Math.round(center.x - textMask.width / 2);
  const startY = Math.round(center.y - textMask.height / 2);
  let textPixels = 0;
  let insidePixels = 0;

  for (let y = 0; y < textMask.height; y += 1) {
    for (let x = 0; x < textMask.width; x += 1) {
      if (textMask.data[(y * textMask.width + x) * 4 + 3] <= 24) {
        continue;
      }
      textPixels += 1;
      const maskX = startX + x;
      const maskY = startY + y;
      if (
        maskX >= 0 &&
        maskY >= 0 &&
        maskX < mask.width &&
        maskY < mask.height &&
        mask.data[(maskY * mask.width + maskX) * 4 + 3] > 10
      ) {
        insidePixels += 1;
      }
    }
  }
  return textPixels > 0 ? insidePixels / textPixels : 0;
}

function measureForeignTerritoryOverlap(
  territoryIds,
  mapWidth,
  mapHeight,
  component,
  countryId,
  textMask,
  center,
) {
  const startX = Math.round(center.x - textMask.width / 2);
  const startY = Math.round(center.y - textMask.height / 2);
  let textPixels = 0;
  let foreignPixels = 0;

  for (let y = 0; y < textMask.height; y += 1) {
    for (let x = 0; x < textMask.width; x += 1) {
      if (textMask.data[(y * textMask.width + x) * 4 + 3] <= 24) {
        continue;
      }
      textPixels += 1;
      const mapX = modulo(component.bounds.x + startX + x, mapWidth);
      const mapY = component.bounds.y + startY + y;
      if (mapY < 0 || mapY >= mapHeight) {
        continue;
      }
      const owner = territoryIds[mapY * mapWidth + mapX];
      if (owner > 0 && owner !== countryId) {
        foreignPixels += 1;
      }
    }
  }
  return textPixels > 0 ? foreignPixels / textPixels : 0;
}

function normalizeMapLabelText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, "").trim() : "";
}

function chooseLabelText(country) {
  return normalizeMapLabelText(
    country.label.text ||
    country.mapLabel ||
    country.shortLabel ||
    country.shortName ||
    country.name,
  );
}

function getPrimaryComponent(country, components) {
  const countryComponents = components
    .filter((component) => component.countryId === country.id)
    .sort((first, second) => second.pixelCount - first.pixelCount);
  if (country.label.componentId) {
    return (
      countryComponents.find(
        (component) =>
          component.componentId === country.label.componentId,
      ) ?? countryComponents[0]
    );
  }
  return countryComponents[0] ?? null;
}

async function calculateAutoLabel(country, component) {
  const text = chooseLabelText(country);
  const mask = await loadComponentMask(component);
  const axis = analyzeMaskAxis(mask);
  const distances = buildDistanceTransform(mask);
  const candidates = findInteriorCandidates(mask, distances, axis.centroid);
  const initialLetterSpacing = Math.max(
    0,
    Math.min(2.8, axis.axisLength / Math.max(1, text.length) * 0.012),
  );
  const estimatedCharacterWidth = Math.max(1, text.length) * 0.78;
  const initialFontSize = Math.max(
    11,
    Math.min(
      150,
      axis.crossWidth * 0.62,
      axis.axisLength /
        Math.max(
          1,
          estimatedCharacterWidth +
            (initialLetterSpacing * Math.max(0, text.length - 1)) /
              Math.max(11, axis.crossWidth),
        ),
    ),
  );
  const angleCandidates = [
    axis.angle,
    Math.max(-60, axis.angle - 8),
    Math.min(60, axis.angle + 8),
    0,
  ].filter(
    (angle, index, values) =>
      values.findIndex((candidate) => Math.abs(candidate - angle) < 0.5) ===
      index,
  );
  let best = {
    ratio: 0,
    fontSize: initialFontSize,
    letterSpacing: initialLetterSpacing,
    angle: axis.angle,
    center: candidates[0] ?? axis.centroid,
    textWidth: 0,
  };

  for (let sizeStep = 0; sizeStep < 7; sizeStep += 1) {
    const fontSize = Math.max(9, initialFontSize * 0.9 ** sizeStep);
    const letterSpacing = Math.max(
      0.5,
      initialLetterSpacing * (fontSize / initialFontSize),
    );
    for (const angle of angleCandidates) {
      const textMask = renderTextMask(
        text,
        fontSize,
        letterSpacing,
        angle,
      );
      for (const center of candidates) {
        const ratio = measureTextMaskFit(mask, textMask, center);
        const score =
          ratio + (fontSize / Math.max(1, initialFontSize)) * 0.035;
        const bestScore =
          best.ratio +
          (best.fontSize / Math.max(1, initialFontSize)) * 0.035;
        if (score > bestScore) {
          best = {
            ratio,
            fontSize,
            letterSpacing,
            angle,
            center,
            textWidth: textMask.textWidth,
          };
        }
      }
      if (best.ratio >= 0.88) {
        break;
      }
    }
    if (best.ratio >= 0.88) {
      break;
    }
  }

  const manual = country.label.mode === "manual";
  const fontSize = manual
    ? country.label.fontSize ?? best.fontSize
    : best.fontSize;
  const letterSpacing = manual
    ? country.label.letterSpacing ?? best.letterSpacing
    : best.letterSpacing;
  const angle = manual ? country.label.angle ?? best.angle : best.angle;
  const x = manual
    ? country.label.x ?? component.bounds.x + best.center.x
    : component.bounds.x + best.center.x;
  const y = manual
    ? country.label.y ?? component.bounds.y + best.center.y
    : component.bounds.y + best.center.y;
  const measured = renderTextMask(text, fontSize, letterSpacing, angle);
  const automaticMinimumZoom =
    fontSize >= 56 ? 1 : fontSize >= 36 ? 1.3 : fontSize >= 24 ? 1.8 : 2.6;

  return {
    countryId: country.id,
    componentId: component.componentId,
    text,
    x,
    y,
    angle,
    fontSize,
    letterSpacing,
    maxWidth: measured.textWidth,
    priority:
      country.label.priority ??
      Math.round(Math.log10(Math.max(10, component.pixelCount)) * 10),
    minZoom: country.label.minZoom ?? automaticMinimumZoom,
    maxZoom: null,
    visible:
      country.label.enabled &&
      country.label.mode !== "hidden" &&
      text.length > 0 &&
      (manual || (best.ratio >= 0.78 && fontSize >= 9)),
    fitRatio: best.ratio,
    mode: country.label.mode,
  };
}

// 직선 라벨 회귀 비교용 레거시 구현이며 실제 생성 경로에서는 사용하지 않는다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateCountryLabels(countries, components) {
  const labels = [];
  for (const country of countries) {
    const component = getPrimaryComponent(country, components);
    if (!component) {
      continue;
    }
    if (!country.name.trim() || country.label.mode === "hidden") {
      labels.push({
        countryId: country.id,
        componentId: component.componentId,
        text: chooseLabelText(country),
        x: component.centroid.x,
        y: component.centroid.y,
        angle: 0,
        fontSize: 0,
        letterSpacing: 0,
        maxWidth: 0,
        priority: country.label.priority ?? 0,
        minZoom: country.label.minZoom ?? 1,
        maxZoom: null,
        visible: false,
        fitRatio: 0,
        mode: country.label.mode,
      });
      continue;
    }
    labels.push(await calculateAutoLabel(country, component));
  }
  return labels;
}

function rotatePoint(point, angleDegrees) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function renderTextOnPathMask(
  text,
  fontSize,
  letterSpacing,
  angle,
  curvatureRatio,
) {
  const measureCanvas = createCanvas(16, 16);
  const measureContext = measureCanvas.getContext("2d");
  measureContext.font = `700 ${fontSize}px "Batang", "Noto Serif CJK KR", serif`;
  const characters = [...text];
  const widths = characters.map((character) =>
    Math.max(fontSize * 0.42, measureContext.measureText(character).width),
  );
  const pathWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, characters.length - 1) * letterSpacing;
  const curveHeight = pathWidth * curvatureRatio;
  const radians = (angle * Math.PI) / 180;
  const unrotatedWidth = pathWidth + fontSize * 2.2;
  const unrotatedHeight = Math.abs(curveHeight) + fontSize * 2.4;
  const canvasWidth = Math.max(
    1,
    Math.ceil(
      Math.abs(unrotatedWidth * Math.cos(radians)) +
        Math.abs(unrotatedHeight * Math.sin(radians)) +
        12,
    ),
  );
  const canvasHeight = Math.max(
    1,
    Math.ceil(
      Math.abs(unrotatedWidth * Math.sin(radians)) +
        Math.abs(unrotatedHeight * Math.cos(radians)) +
        12,
    ),
  );
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate(radians);
  context.font = `700 ${fontSize}px "Batang", "Noto Serif CJK KR", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#FFFFFF";
  const glyphs = [];
  let cursor = -pathWidth / 2;

  for (let index = 0; index < characters.length; index += 1) {
    const width = widths[index];
    const centerX = cursor + width / 2;
    const t = pathWidth > 0 ? centerX / pathWidth + 0.5 : 0.5;
    const centerY =
      4 * curveHeight * t * (1 - t) - curveHeight;
    const slope =
      pathWidth > 0 ? (4 * curveHeight * (1 - 2 * t)) / pathWidth : 0;
    const tangent = Math.atan(slope);
    context.save();
    context.translate(centerX, centerY);
    context.rotate(tangent);
    context.fillText(characters[index], 0, 0);
    context.restore();
    glyphs.push({
      character: characters[index],
      t,
      x: centerX,
      y: centerY,
      angle: (tangent * 180) / Math.PI,
      width,
      height: fontSize * 1.15,
    });
    cursor += width + letterSpacing;
  }

  return {
    width: canvasWidth,
    height: canvasHeight,
    pathWidth,
    curveHeight,
    glyphs,
    data: context.getImageData(0, 0, canvasWidth, canvasHeight).data,
  };
}

function labelPathPoints(center, angle, pathWidth, curveHeight) {
  const startOffset = rotatePoint(
    { x: -pathWidth / 2, y: -curveHeight },
    angle,
  );
  const controlOffset = rotatePoint(
    { x: 0, y: curveHeight },
    angle,
  );
  const endOffset = rotatePoint(
    { x: pathWidth / 2, y: -curveHeight },
    angle,
  );
  return {
    start: { x: center.x + startOffset.x, y: center.y + startOffset.y },
    control: {
      x: center.x + controlOffset.x,
      y: center.y + controlOffset.y,
    },
    end: { x: center.x + endOffset.x, y: center.y + endOffset.y },
  };
}

function chooseCountryLabelGroups(country, components) {
  const countryComponents = components
    .filter((component) => component.countryId === country.id)
    .sort(
      (first, second) =>
        second.pixelCount - first.pixelCount ||
        first.componentId.localeCompare(second.componentId),
    );
  if (countryComponents.length === 0) {
    return [];
  }

  if (country.labelGroups.length > 0) {
    const manualGroups = [];
    for (const setting of country.labelGroups) {
      const members = countryComponents.filter(
        (component) =>
          setting.componentIds.includes(component.componentId) ||
          setting.componentIds.includes(component.displayGroupId) ||
          setting.id === component.displayGroupId,
      );
      if (members.length === 0 && setting.componentIds.length === 0) {
        const matching = countryComponents.find(
          (component) => component.displayGroupId === setting.id,
        );
        if (matching) {
          members.push(matching);
        }
      }
      if (members.length > 0) {
        manualGroups.push({
          id: setting.id,
          components: members,
          primary: members[0],
          setting,
          forced: true,
        });
      }
    }
    if (manualGroups.length > 0) {
      return manualGroups;
    }
  }

  const repeat = country.labelRepeat;
  const largest = countryComponents[0];
  const selected = [
    {
      id: largest.displayGroupId,
      components: [largest],
      primary: largest,
      setting: null,
      forced: true,
    },
  ];
  const preferredComponent = country.label.componentId
    ? countryComponents.find(
        (component) => component.componentId === country.label.componentId,
      )
    : null;
  if (
    preferredComponent &&
    preferredComponent.componentId !== largest.componentId
  ) {
    selected.push({
      id: preferredComponent.displayGroupId,
      components: [preferredComponent],
      primary: preferredComponent,
      setting: null,
      forced: true,
    });
  }
  if (!repeat.enabled) {
    return selected;
  }
  for (const component of countryComponents.slice(1)) {
    if (selected.length >= repeat.maxAutomaticLabels) {
      break;
    }
    if (
      selected.some(
        (group) => group.primary.componentId === component.componentId,
      )
    ) {
      continue;
    }
    const relativeArea = component.pixelCount / largest.pixelCount;
    const hasArea =
      component.pixelCount >= repeat.minimumPixelArea &&
      relativeArea >= repeat.minimumRelativeArea;
    const hasRoom =
      component.bounds.width >= repeat.minimumBoundsWidth &&
      component.bounds.height >= repeat.minimumBoundsHeight;
    const narrowButLong =
      component.bounds.width >= repeat.minimumBoundsWidth * 1.8 ||
      component.bounds.height >= repeat.minimumBoundsHeight * 3;
    if (hasArea && (hasRoom || narrowButLong)) {
      selected.push({
        id: component.displayGroupId,
        components: [component],
        primary: component,
        setting: null,
        forced: false,
      });
    }
  }
  return selected;
}

async function calculatePathLabel(
  country,
  group,
  groupIndex,
  territoryIds,
  mapWidth,
  mapHeight,
) {
  const component = group.primary;
  const setting = group.setting;
  const text = normalizeMapLabelText(
    setting?.text ||
    country.label.text ||
    country.mapLabel ||
    country.shortLabel ||
    country.shortName ||
    country.name,
  );
  const [mask, ownershipMask] = await Promise.all([
    loadLabelFitMask(component),
    loadComponentMask(component),
  ]);
  const axis = analyzeMaskAxis(mask);
  const distances = buildDistanceTransform(mask);
  const centers = findInteriorCandidates(mask, distances, axis.centroid);
  const initialSpacing = Math.max(
    0,
    Math.min(2.8, axis.axisLength / Math.max(1, text.length) * 0.012),
  );
  const maximumFontSize =
    component.pixelCount >= 350_000
      ? 190
      : component.pixelCount >= 150_000
        ? 170
        : 150;
  const initialFontSize = Math.max(
    10,
    Math.min(
      maximumFontSize,
      axis.crossWidth * 0.68,
      axis.axisLength / Math.max(1, text.length * 0.7),
    ),
  );
  const forcedLayout = setting?.layoutMode ?? null;
  const curveCandidates = forcedLayout
    ? [
        forcedLayout === "straight"
          ? 0
          : (Math.abs(setting?.curvature ?? 0.1) *
              (forcedLayout === "arc-up" ? -1 : 1)),
      ]
    : component.archipelago
      ? [-0.075, 0.075, -0.135, 0.135, 0]
      : [-0.055, 0.055, -0.1, 0.1, 0];
  const angleCandidates =
    setting?.angle !== null && setting?.angle !== undefined
      ? [setting.angle]
      : [axis.angle, axis.angle - 6, axis.angle + 6, 0].filter(
          (angle, index, values) =>
            values.findIndex(
              (candidate) => Math.abs(candidate - angle) < 0.5,
            ) === index,
        );
  let best = null;

  for (let sizeStep = 0; sizeStep < 8; sizeStep += 1) {
    const fontSize =
      setting?.fontSize ??
      country.label.fontSize ??
      Math.max(9, initialFontSize * 0.9 ** sizeStep);
    const letterSpacing =
      setting?.letterSpacing ??
      country.label.letterSpacing ??
      Math.max(0, initialSpacing * (fontSize / initialFontSize));
    for (const curvatureRatio of curveCandidates) {
      for (const angle of angleCandidates) {
        const textMask = renderTextOnPathMask(
          text,
          fontSize,
          letterSpacing,
          angle,
          curvatureRatio,
        );
        for (const centerCandidate of centers) {
          const center =
            setting?.x !== null &&
            setting?.x !== undefined &&
            setting?.y !== null &&
            setting?.y !== undefined
              ? {
                  x: setting.x - component.bounds.x,
                  y: setting.y - component.bounds.y,
                }
              : centerCandidate;
          const fitRatio = measureTextMaskFit(mask, textMask, center);
          const ownershipFitRatio = measureTextMaskFit(
            ownershipMask,
            textMask,
            center,
          );
          const foreignOverlapRatio = measureForeignTerritoryOverlap(
            territoryIds,
            mapWidth,
            mapHeight,
            component,
            country.id,
            textMask,
            center,
          );
          const centerIndex =
            Math.round(center.y) * mask.width + Math.round(center.x);
          const clearance =
            centerIndex >= 0 && centerIndex < distances.length
              ? distances[centerIndex]
              : 0;
          const curvePenalty = Math.abs(curvatureRatio) * 0.07;
          const preferredDirection =
            axis.upperSpace > axis.lowerSpace * 1.08
              ? -1
              : axis.lowerSpace > axis.upperSpace * 1.08
                ? 1
                : 0;
          const curveDirection = Math.sign(curvatureRatio);
          const directionBonus =
            preferredDirection === 0 || curveDirection === 0
              ? 0
              : curveDirection === preferredDirection
                ? 0.025
                : -0.012;
          const curvedCandidateBonus =
            curveDirection === 0
              ? 0
              : component.archipelago
                ? 0.055
                : text.length >= 4 || axis.axisLength >= 160
                  ? 0.038
                  : 0.018;
          const ownershipBonus = Math.min(
            0.045,
            ownershipFitRatio * (component.archipelago ? 0.09 : 0.045),
          );
          const emptyAirPenalty =
            component.archipelago && ownershipFitRatio < 0.1
              ? (0.1 - ownershipFitRatio) * 0.35
              : 0;
          const foreignTerritoryPenalty =
            foreignOverlapRatio * (component.archipelago ? 1.35 : 2.15);
          const sizeBonus = fontSize / Math.max(1, initialFontSize) * 0.045;
          const clearanceBonus =
            Math.min(1, clearance / Math.max(1, fontSize)) * 0.035;
          const score =
            fitRatio +
            sizeBonus +
            clearanceBonus +
            directionBonus -
            curvePenalty +
            curvedCandidateBonus +
            ownershipBonus -
            emptyAirPenalty -
            foreignTerritoryPenalty;
          if (!best || score > best.score) {
            best = {
              score,
              fitRatio,
              ownershipFitRatio,
              foreignOverlapRatio,
              fontSize,
              letterSpacing,
              angle,
              curvatureRatio,
              center,
              textMask,
            };
          }
        }
      }
    }
    const acceptableForeignOverlap = component.archipelago ? 0.08 : 0.035;
    if (
      (best?.fitRatio >= 0.87 &&
        best.foreignOverlapRatio <= acceptableForeignOverlap) ||
      setting?.fontSize
    ) {
      break;
    }
  }

  const localCenter = best?.center ?? axis.centroid;
  const globalCenter = {
    x: component.bounds.x + localCenter.x,
    y: component.bounds.y + localCenter.y,
  };
  const path = setting?.start && setting?.control && setting?.end
    ? {
        start: setting.start,
        control: setting.control,
        end: setting.end,
      }
    : labelPathPoints(
        globalCenter,
        best?.angle ?? axis.angle,
        best?.textMask.pathWidth ?? 0,
        best?.textMask.curveHeight ?? 0,
      );
  const curvatureRatio = best?.curvatureRatio ?? 0;
  const layoutMode =
    curvatureRatio < -0.01
      ? "arc-up"
      : curvatureRatio > 0.01
        ? "arc-down"
        : "straight";
  const fontSize = best?.fontSize ?? 0;
  const automaticMinimumZoom =
    fontSize >= 56 ? 0.75 : fontSize >= 36 ? 1 : fontSize >= 24 ? 1.5 : 2.4;
  const forced =
    group.forced ||
    setting?.mode === "manual" ||
    country.label.mode === "manual";
  const visible =
    country.label.enabled &&
    country.label.mode !== "hidden" &&
    setting?.enabled !== false &&
    setting?.mode !== "hidden" &&
    text.length > 0 &&
    (forced || ((best?.fitRatio ?? 0) >= 0.78 && fontSize >= 9));

  return {
    countryId: country.id,
    componentId: component.componentId,
    labelGroupId: group.id,
    text,
    layoutMode,
    pathType: "quadratic",
    start: path.start,
    control: path.control,
    end: path.end,
    x: globalCenter.x,
    y: globalCenter.y,
    angle: best?.angle ?? axis.angle,
    curvature: curvatureRatio,
    fontSize,
    letterSpacing: best?.letterSpacing ?? 0,
    maxWidth: best?.textMask.pathWidth ?? 0,
    groupPixelCount: component.pixelCount,
    priority:
      setting?.priority ??
      country.label.priority ??
      Math.round(Math.log10(Math.max(10, component.pixelCount)) * 10) -
        groupIndex,
    minZoom:
      setting?.minZoom ??
      country.label.minZoom ??
      automaticMinimumZoom,
    maxZoom: null,
    visible,
    fitRatio: best?.fitRatio ?? 0,
    ownershipFitRatio: best?.ownershipFitRatio ?? 0,
    candidateScore: best?.score ?? 0,
    mode: setting?.mode ?? country.label.mode,
    hiddenReason: visible
      ? null
      : text.length === 0
        ? "empty-name"
        : "insufficient-territory-fit",
  };
}

async function generatePathCountryLabels(
  countries,
  components,
  territoryIds,
  mapWidth,
  mapHeight,
) {
  const labels = [];
  for (const country of countries) {
    const groups = chooseCountryLabelGroups(country, components);
    if (groups.length === 0) {
      continue;
    }
    for (let index = 0; index < groups.length; index += 1) {
      labels.push(
        await calculatePathLabel(
          country,
          groups[index],
          index,
          territoryIds,
          mapWidth,
          mapHeight,
        ),
      );
    }
  }
  return labels;
}

function previewColor(value) {
  return {
    r: 48 + ((value * 73) % 176),
    g: 48 + ((value * 131) % 176),
    b: 48 + ((value * 197) % 176),
  };
}

function createIndexedPreview(indexes, width, height) {
  const preview = createPng(width, height);
  const sea = hexToRgb(mapColorConfig.seaColor);
  for (let index = 0; index < indexes.length; index += 1) {
    const value = indexes[index];
    const offset = index * 4;
    const color = value > 0 ? previewColor(value) : sea;
    preview.data[offset] = color.r;
    preview.data[offset + 1] = color.g;
    preview.data[offset + 2] = color.b;
    preview.data[offset + 3] = 255;
  }
  return preview;
}

function createDisplayGroupPreview(
  physicalLabels,
  displayGroups,
  width,
  height,
) {
  const labelToGroup = new Int32Array(
    displayGroups.reduce(
      (maximum, group) =>
        Math.max(
          maximum,
          ...group.members.map((component) => component.label),
        ),
      0,
    ) + 1,
  );
  displayGroups.forEach((group, groupIndex) => {
    for (const member of group.members) {
      labelToGroup[member.label] = groupIndex + 1;
    }
  });
  const groupIndexes = new Int32Array(physicalLabels.length);
  for (let index = 0; index < physicalLabels.length; index += 1) {
    groupIndexes[index] = labelToGroup[physicalLabels[index]] ?? 0;
  }
  return createIndexedPreview(groupIndexes, width, height);
}

async function createLabelEnvelopePreview(components, width, height) {
  const preview = createPng(width, height);
  const sea = hexToRgb(mapColorConfig.seaColor);
  for (let index = 0; index < width * height; index += 1) {
    setPixel(preview, index, sea);
  }
  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = components[componentIndex];
    if (!component.labelEnvelopePath) {
      continue;
    }
    const envelope = PNG.sync.read(
      await readFile(
        path.join(
          labelEnvelopeDirectory,
          path.basename(component.labelEnvelopePath),
        ),
      ),
    );
    const color = previewColor(component.countryId * 97 + componentIndex);
    for (let localY = 0; localY < envelope.height; localY += 1) {
      const worldY = component.bounds.y + localY;
      if (worldY < 0 || worldY >= height) {
        continue;
      }
      for (let localX = 0; localX < envelope.width; localX += 1) {
        if (
          envelope.data[(localY * envelope.width + localX) * 4 + 3] <= 10
        ) {
          continue;
        }
        const worldX = modulo(component.bounds.x + localX, width);
        setPixel(preview, worldY * width + worldX, color);
      }
    }
  }
  return preview;
}

function drawPreviewLine(png, first, second, color) {
  let x0 = Math.round(first.x);
  let y0 = Math.round(first.y);
  const x1 = Math.round(second.x);
  const y1 = Math.round(second.y);
  const deltaX = Math.abs(x1 - x0);
  const stepX = x0 < x1 ? 1 : -1;
  const deltaY = -Math.abs(y1 - y0);
  const stepY = y0 < y1 ? 1 : -1;
  let error = deltaX + deltaY;
  while (true) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const x = modulo(x0 + offsetX, png.width);
        const y = y0 + offsetY;
        if (y >= 0 && y < png.height) {
          setPixel(png, y * png.width + x, color);
        }
      }
    }
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const doubled = 2 * error;
    if (doubled >= deltaY) {
      error += deltaY;
      x0 += stepX;
    }
    if (doubled <= deltaX) {
      error += deltaX;
      y0 += stepY;
    }
  }
}

function createGroupMergePreview(
  physicalLabels,
  displayGroups,
  width,
  height,
) {
  const preview = createDisplayGroupPreview(
    physicalLabels,
    displayGroups,
    width,
    height,
  );
  for (const group of displayGroups) {
    if (group.members.length < 2) {
      continue;
    }
    for (const member of group.members) {
      const memberX = shiftNear(
        member.centroidX,
        group.centroidX,
        width,
      );
      drawPreviewLine(
        preview,
        { x: modulo(group.centroidX, width), y: group.centroidY },
        { x: modulo(memberX, width), y: member.centroidY },
        { r: 246, g: 229, b: 141 },
      );
    }
  }
  return preview;
}

function createLabelPathsPreview(width, height, labels) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = mapColorConfig.seaColor;
  context.fillRect(0, 0, width, height);
  context.lineWidth = 3;
  context.font = '700 18px "Batang", serif';

  for (const label of labels) {
    if (!label.visible) {
      continue;
    }
    context.beginPath();
    context.moveTo(label.start.x, label.start.y);
    context.quadraticCurveTo(
      label.control.x,
      label.control.y,
      label.end.x,
      label.end.y,
    );
    context.strokeStyle =
      label.layoutMode === "arc-up"
        ? "#52D6FF"
        : label.layoutMode === "arc-down"
          ? "#FFB45C"
          : "#D8E0E8";
    context.stroke();
    context.fillStyle = "#FFFFFF";
    context.fillText(
      `${label.text} · ${label.labelGroupId} · ${(label.fitRatio * 100).toFixed(1)}% · ${label.candidateScore.toFixed(3)}`,
      label.start.x,
      label.start.y - 8,
    );
    for (const point of [label.start, label.control, label.end]) {
      context.beginPath();
      context.arc(point.x, point.y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }
  return canvas.toBuffer("image/png");
}

async function resolveSourcePath() {
  if (process.env.MAP_SOURCE_PATH) {
    const configuredPath = path.resolve(process.env.MAP_SOURCE_PATH);
    await access(configuredPath);
    return configuredPath;
  }
  try {
    await access(preferredSourcePath);
    return preferredSourcePath;
  } catch {
    return legacySourcePath;
  }
}

async function writePng(fileName, png) {
  await writeFile(
    path.join(generatedDirectory, fileName),
    PNG.sync.write(png),
  );
}

async function main() {
  const sourcePath = await resolveSourcePath();
  const source = PNG.sync.read(await readFile(sourcePath));
  const representatives = extractRepresentativeColors(source);
  const [rawExistingCountries, colorMigrations] = await Promise.all([
    readJsonArray(countriesReadPath),
    readJsonArray(colorMigrationsPath),
  ]);
  const existingCountries = applyColorMigrations(
    rawExistingCountries,
    colorMigrations,
  );
  const countries = assignStableIds(representatives, existingCountries);
  const classification = classifySourcePixels(
    source,
    countries,
    mapColorConfig,
  );
  const restoration = restoreCleanOwnership(
    classification.classifications,
    source.width,
    source.height,
  );
  const layers = generateCleanRasterLayers(
    source,
    classification.classifications,
    restoration.ownership,
    countries,
    mapColorConfig,
  );
  const validCountryIds = new Set(countries.map((country) => country.id));
  const territoryIds = new Uint16Array(restoration.ownership.length);
  for (let index = 0; index < restoration.ownership.length; index += 1) {
    const owner = restoration.ownership[index];
    territoryIds[index] = validCountryIds.has(owner) ? owner : 0;
  }

  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(debugDirectory, { recursive: true });
  await mkdir(dataOutputDirectory, { recursive: true });
  await Promise.all([
    writePng("world-1932-fill.png", layers.fill),
    writePng("world-1932-province-lines.png", layers.provinceLines),
    writePng("world-1932-country-lines.png", layers.countryLines),
    writePng("world-1932-countries.png", layers.countries),
    writePng("world-1932-id-map.png", layers.cleanIdMap),
    writePng("world-1932-clean-id-map.png", layers.cleanIdMap),
    writeFile(
      path.join(debugDirectory, "world-1932-clean-id-preview.png"),
      PNG.sync.write(
        createOwnershipPreview(
          restoration.ownership,
          countries,
          source.width,
          source.height,
        ),
      ),
    ),
    writeFile(
      path.join(debugDirectory, "world-1932-country-lines-preview.png"),
      PNG.sync.write(layers.countries),
    ),
  ]);

  const { labels, components: rawComponents } = analyzeRawComponents(
    territoryIds,
    source.width,
    source.height,
  );
  const physicalComponents = rawComponents.map((component) => ({
    countryId: component.countryId,
    physicalComponentId:
      `country-${String(component.countryId).padStart(3, "0")}` +
      `-physical-${String(component.label).padStart(5, "0")}`,
    pixelCount: component.pixelCount,
    bounds: {
      x: component.minX,
      y: component.minY,
      width: component.maxX - component.minX + 1,
      height: component.maxY - component.minY + 1,
    },
    centroid: {
      x: component.centroidX,
      y: component.centroidY,
    },
    representative: component.representative,
  }));
  const componentGroups = groupSmallComponents(
    rawComponents,
    source.width,
    countries,
  );
  const components = await generateComponentMasks(
    labels,
    componentGroups,
    source.width,
    source.height,
  );
  const countryLabels = await generatePathCountryLabels(
    countries,
    components,
    territoryIds,
    source.width,
    source.height,
  );
  await Promise.all([
    writeFile(
      path.join(debugDirectory, "world-1932-components-preview.png"),
      PNG.sync.write(
        createIndexedPreview(labels, source.width, source.height),
      ),
    ),
    writeFile(
      path.join(debugDirectory, "world-1932-display-groups-preview.png"),
      PNG.sync.write(
        createDisplayGroupPreview(
          labels,
          componentGroups,
          source.width,
          source.height,
        ),
      ),
    ),
    writeFile(
      path.join(debugDirectory, "world-1932-label-paths-preview.png"),
      createLabelPathsPreview(source.width, source.height, countryLabels),
    ),
    writeFile(
      path.join(
        debugDirectory,
        "world-1932-label-envelopes-preview.png",
      ),
      PNG.sync.write(
        await createLabelEnvelopePreview(
          components,
          source.width,
          source.height,
        ),
      ),
    ),
    writeFile(
      path.join(debugDirectory, "world-1932-group-merge-preview.png"),
      PNG.sync.write(
        createGroupMergePreview(
          labels,
          componentGroups,
          source.width,
          source.height,
        ),
      ),
    ),
  ]);

  await writeFile(
    countriesPath,
    `${JSON.stringify(countries, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    componentsPath,
    `${JSON.stringify(components, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    physicalComponentsPath,
    `${JSON.stringify(physicalComponents, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    displayGroupsPath,
    `${JSON.stringify(components, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    labelsPath,
    `${JSON.stringify(countryLabels, null, 2)}\n`,
    "utf8",
  );
  const generationReport = {
    source: path.relative(projectRoot, sourcePath).replaceAll("\\", "/"),
    width: source.width,
    height: source.height,
    representativeColorCount: representatives.length,
    colorMigrationCount: colorMigrations.length,
    pixelClassification: classification.counts,
    restoredOwnershipPixelCount: restoration.restorablePixelCount,
    unresolvedDarkLinePixelCount: restoration.unresolvedPixelCount,
    unresolvedDarkLineSamples: restoration.unresolvedSamples,
    rawComponentCount: rawComponents.length,
    componentAndMaskCount: components.length,
    visibleCountryLabelCount: countryLabels.filter((label) => label.visible)
      .length,
    hiddenCountryLabelCount: countryLabels.filter((label) => !label.visible)
      .length,
    lowFitCountryLabels: countryLabels
      .filter((label) => label.visible && label.fitRatio < 0.86)
      .map((label) => ({
        countryId: label.countryId,
        componentId: label.componentId,
        fitRatio: label.fitRatio,
      })),
    restoredInternalProvinceLinePixels:
      layers.restoredInternalLinePixels,
    countryBoundaryPixels: layers.countryBoundaryPixels,
    internalProvinceLinePixelsInCountryLayer:
      layers.internalLinePixelsInCountryLayer,
    physicalComponentCounts: Object.fromEntries(
      countries.map((country) => [
        country.key,
        rawComponents.filter(
          (component) => component.countryId === country.id,
        ).length,
      ]),
    ),
    significantPhysicalComponentCounts: Object.fromEntries(
      countries.map((country) => [
        country.key,
        rawComponents.filter(
          (component) =>
            component.countryId === country.id &&
            component.pixelCount >= mapColorConfig.labelRepeat.minimumPixelArea,
        ).length,
      ]),
    ),
    labelGroupCounts: Object.fromEntries(
      countries.map((country) => [
        country.key,
        countryLabels.filter(
          (label) => label.countryId === country.id && label.visible,
        ).length,
      ]),
    ),
    repeatedLabelCountries: countries
      .filter(
        (country) =>
          countryLabels.filter(
            (label) => label.countryId === country.id && label.visible,
          ).length > 1,
      )
      .map((country) => ({
        id: country.id,
        key: country.key,
        name: country.name,
      })),
    labelLayoutModeCounts: {
      straight: countryLabels.filter(
        (label) => label.visible && label.layoutMode === "straight",
      ).length,
      arcUp: countryLabels.filter(
        (label) => label.visible && label.layoutMode === "arc-up",
      ).length,
      arcDown: countryLabels.filter(
        (label) => label.visible && label.layoutMode === "arc-down",
      ).length,
    },
    protectedCountryIds: mapColorConfig.protectedCountryIds,
    protectedCountries: countries
      .filter((country) =>
        mapColorConfig.protectedCountryIds.includes(country.id),
      )
      .map((country) => ({
        id: country.id,
        key: country.key,
        color: country.color,
        name: country.name,
        physicalComponentCount: rawComponents.filter(
          (component) => component.countryId === country.id,
        ).length,
      })),
    archipelagoDisplayGroups: components
      .filter((component) => component.archipelago)
      .map((component) => ({
        countryId: component.countryId,
        componentId: component.componentId,
        displayGroupId: component.displayGroupId,
        physicalComponentIds: component.physicalComponentIds,
        pixelCount: component.pixelCount,
        labelEnvelopePath: component.labelEnvelopePath,
        labelEnvelopeBuffer: component.labelEnvelopeBuffer,
      })),
    lowFrequencyRepresentativeColors: [...representatives]
      .sort((first, second) => first.pixelCount - second.pixelCount)
      .slice(0, 12)
      .map((color) => ({
        color: color.hex,
        pixelCount: color.pixelCount,
      })),
  };
  await writeFile(
    path.join(generatedDirectory, "map-generation-report.json"),
    `${JSON.stringify(generationReport, null, 2)}\n`,
    "utf8",
  );

  console.log(`원본 지도: ${path.relative(projectRoot, sourcePath)}`);
  console.log(`지도 크기: ${source.width}×${source.height}`);
  console.log(`대표 국가색: ${representatives.length}개`);
  console.log(`8방향 물리 연결요소: ${rawComponents.length}개`);
  console.log(`표시 그룹 및 마스크: ${components.length}개`);
  console.log(
    `표시 라벨: ${countryLabels.filter((label) => label.visible).length}개`,
  );
  console.log(
    `숨김 라벨: ${countryLabels.filter((label) => !label.visible).length}개`,
  );
  console.log(
    `복원된 선/미분류 픽셀: ${restoration.restorablePixelCount}개`,
  );
  console.log(
    `복원되지 않은 DARK_LINE 픽셀: ${restoration.unresolvedPixelCount}개`,
  );
  console.log(
    `국가 국경 레이어 내부선 픽셀: ${layers.internalLinePixelsInCountryLayer}개`,
  );
  console.log(`생성 경로: ${path.relative(projectRoot, generatedDirectory)}`);
}

await main();
