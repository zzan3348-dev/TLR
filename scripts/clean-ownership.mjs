import { PNG } from "pngjs";

export const OWNERSHIP = Object.freeze({
  SEA: 0,
  UNASSIGNED: 65_535,
  TRANSPARENT: 65_534,
  DARK_LINE: 65_533,
  UNKNOWN: 65_532,
});

const NEIGHBORS_8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function colorDistance(first, second) {
  return Math.hypot(
    first.r - second.r,
    first.g - second.g,
    first.b - second.b,
  );
}

function hexToRgb(hex) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`잘못된 HEX 색상: ${hex}`);
  }
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
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

function isCountryId(owner) {
  return owner > 0 && owner < OWNERSHIP.UNKNOWN;
}

function ownerCategory(owner) {
  if (owner === OWNERSHIP.SEA) {
    return "sea";
  }
  if (owner === OWNERSHIP.UNASSIGNED) {
    return "unassigned";
  }
  if (owner === OWNERSHIP.TRANSPARENT) {
    return "transparent";
  }
  if (isCountryId(owner)) {
    return "country";
  }
  return "unknown";
}

function chooseNearestOwner(color, countryPalette, tolerance) {
  let nearestId = OWNERSHIP.UNKNOWN;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const entry of countryPalette) {
    const distance = colorDistance(color, entry.color);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = entry.id;
    }
  }
  return nearestDistance <= tolerance ? nearestId : OWNERSHIP.UNKNOWN;
}

export function classifySourcePixels(source, countries, config) {
  const pixelCount = source.width * source.height;
  const classifications = new Uint16Array(pixelCount);
  const countryPalette = countries.map((country) => ({
    id: country.id,
    color: hexToRgb(country.color),
  }));
  const seaColor = hexToRgb(config.seaColor);
  const protectedCountryIds = new Set(config.protectedCountryIds ?? []);
  const protectedPalette = countryPalette.filter((entry) =>
    protectedCountryIds.has(entry.id),
  );
  const counts = {
    sea: 0,
    unassigned: 0,
    countryInterior: 0,
    darkLine: 0,
    transparent: 0,
    unknown: 0,
  };

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const color = {
      r: source.data[offset],
      g: source.data[offset + 1],
      b: source.data[offset + 2],
      a: source.data[offset + 3],
    };
    if (color.a <= 10) {
      classifications[pixelIndex] = OWNERSHIP.TRANSPARENT;
      counts.transparent += 1;
      continue;
    }
    if (colorDistance(color, seaColor) <= config.seaTolerance) {
      classifications[pixelIndex] = OWNERSHIP.SEA;
      counts.sea += 1;
      continue;
    }
    if (color.r >= config.whiteChannelMinimum &&
        color.g >= config.whiteChannelMinimum &&
        color.b >= config.whiteChannelMinimum) {
      classifications[pixelIndex] = OWNERSHIP.UNASSIGNED;
      counts.unassigned += 1;
      continue;
    }
    const protectedCountryId = chooseNearestOwner(
      color,
      protectedPalette,
      config.protectedCountryMatchTolerance ?? 0,
    );
    if (protectedCountryId !== OWNERSHIP.UNKNOWN) {
      classifications[pixelIndex] = protectedCountryId;
      counts.countryInterior += 1;
      continue;
    }
    const maximum = Math.max(color.r, color.g, color.b);
    const minimum = Math.min(color.r, color.g, color.b);
    if (
      maximum <= config.darkChannelMaximum ||
      (maximum <= config.darkLineMaximum && maximum - minimum <= 24)
    ) {
      classifications[pixelIndex] = OWNERSHIP.DARK_LINE;
      counts.darkLine += 1;
      continue;
    }

    const countryId = chooseNearestOwner(
      color,
      countryPalette,
      config.countryMatchTolerance,
    );
    classifications[pixelIndex] = countryId;
    if (countryId === OWNERSHIP.UNKNOWN) {
      counts.unknown += 1;
    } else {
      counts.countryInterior += 1;
    }
  }

  return { classifications, counts };
}

function selectSeedOwner(ownerCounts) {
  let selectedOwner = OWNERSHIP.UNKNOWN;
  let selectedCount = -1;
  for (const [owner, count] of ownerCounts) {
    const ownerIsCountry = isCountryId(owner);
    const selectedIsCountry = isCountryId(selectedOwner);
    if (
      count > selectedCount ||
      (count === selectedCount && ownerIsCountry && !selectedIsCountry) ||
      (count === selectedCount &&
        ownerIsCountry === selectedIsCountry &&
        owner < selectedOwner)
    ) {
      selectedOwner = owner;
      selectedCount = count;
    }
  }
  return selectedOwner;
}

export function restoreCleanOwnership(
  classifications,
  width,
  height,
) {
  const pixelCount = width * height;
  const ownership = classifications.slice();
  const distance = new Uint16Array(pixelCount);
  distance.fill(65_535);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  let restorablePixelCount = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    if (
      classifications[index] !== OWNERSHIP.DARK_LINE &&
      classifications[index] !== OWNERSHIP.UNKNOWN
    ) {
      distance[index] = 0;
      continue;
    }
    restorablePixelCount += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const ownerCounts = new Map();
    for (const [offsetX, offsetY] of NEIGHBORS_8) {
      const candidateY = y + offsetY;
      if (candidateY < 0 || candidateY >= height) {
        continue;
      }
      const candidateX = (x + offsetX + width) % width;
      const candidateIndex = candidateY * width + candidateX;
      const owner = classifications[candidateIndex];
      if (
        owner === OWNERSHIP.DARK_LINE ||
        owner === OWNERSHIP.UNKNOWN ||
        owner === OWNERSHIP.TRANSPARENT
      ) {
        continue;
      }
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    }
    if (ownerCounts.size > 0) {
      ownership[index] = selectSeedOwner(ownerCounts);
      distance[index] = 1;
      queue[queueEnd] = index;
      queueEnd += 1;
    }
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const nextDistance = Math.min(65_534, distance[index] + 1);
    for (const [offsetX, offsetY] of NEIGHBORS_8) {
      const candidateY = y + offsetY;
      if (candidateY < 0 || candidateY >= height) {
        continue;
      }
      const candidateX = (x + offsetX + width) % width;
      const candidateIndex = candidateY * width + candidateX;
      if (
        classifications[candidateIndex] !== OWNERSHIP.DARK_LINE &&
        classifications[candidateIndex] !== OWNERSHIP.UNKNOWN
      ) {
        continue;
      }
      if (nextDistance < distance[candidateIndex]) {
        distance[candidateIndex] = nextDistance;
        ownership[candidateIndex] = ownership[index];
        queue[queueEnd] = candidateIndex;
        queueEnd += 1;
      } else if (
        nextDistance === distance[candidateIndex] &&
        isCountryId(ownership[index]) &&
        !isCountryId(ownership[candidateIndex])
      ) {
        ownership[candidateIndex] = ownership[index];
      }
    }
  }

  const unresolvedSamples = [];
  let unresolvedPixelCount = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (
      ownership[index] !== OWNERSHIP.DARK_LINE &&
      ownership[index] !== OWNERSHIP.UNKNOWN
    ) {
      continue;
    }
    unresolvedPixelCount += 1;
    if (unresolvedSamples.length < 40) {
      unresolvedSamples.push({
        x: index % width,
        y: Math.floor(index / width),
      });
    }
    ownership[index] = OWNERSHIP.SEA;
  }

  return {
    ownership,
    restorablePixelCount,
    unresolvedPixelCount,
    unresolvedSamples,
  };
}

function shouldDrawBoundary(first, second) {
  if (first === second) {
    return false;
  }
  const firstCategory = ownerCategory(first);
  const secondCategory = ownerCategory(second);
  if (
    firstCategory === "transparent" ||
    secondCategory === "transparent"
  ) {
    return false;
  }
  return firstCategory === "country" || secondCategory === "country";
}

export function generateCleanRasterLayers(
  source,
  classifications,
  ownership,
  countries,
  config,
) {
  const { width, height } = source;
  const pixelCount = width * height;
  const countryById = new Map(
    countries.map((country) => [country.id, hexToRgb(country.color)]),
  );
  const seaColor = hexToRgb(config.seaColor);
  const unassignedColor = { r: 245, g: 246, b: 246 };
  const lineColor = { r: 4, g: 11, b: 18 };
  const fill = createPng(width, height);
  const provinceLines = createPng(width, height);
  const countryLines = createPng(width, height);
  const countriesLayer = createPng(width, height);
  const cleanIdMap = createPng(width, height);
  const boundaryMask = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const owner = ownership[index];
    if (owner === OWNERSHIP.TRANSPARENT) {
      setPixel(fill, index, seaColor, 0);
      setPixel(cleanIdMap, index, { r: 0, g: 0, b: 0 }, 0);
      continue;
    }
    if (owner === OWNERSHIP.SEA) {
      setPixel(fill, index, seaColor);
    } else if (owner === OWNERSHIP.UNASSIGNED) {
      setPixel(fill, index, unassignedColor);
    } else {
      setPixel(fill, index, countryById.get(owner) ?? unassignedColor);
    }

    const idForMap = owner === OWNERSHIP.TRANSPARENT ? 0 : owner;
    setPixel(cleanIdMap, index, {
      r: idForMap & 255,
      g: (idForMap >> 8) & 255,
      b: (idForMap >> 16) & 255,
    });

    if (classifications[index] === OWNERSHIP.DARK_LINE) {
      setPixel(provinceLines, index, lineColor, 190);
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const owner = ownership[index];
      const rightIndex = y * width + ((x + 1) % width);
      if (shouldDrawBoundary(owner, ownership[rightIndex])) {
        boundaryMask[index] = 1;
        boundaryMask[rightIndex] = 1;
      }
      if (y + 1 < height) {
        const bottomIndex = (y + 1) * width + x;
        if (shouldDrawBoundary(owner, ownership[bottomIndex])) {
          boundaryMask[index] = 1;
          boundaryMask[bottomIndex] = 1;
        }
      }
    }
  }

  let countryBoundaryPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (boundaryMask[index] === 0) {
      continue;
    }
    countryBoundaryPixels += 1;
    setPixel(countryLines, index, lineColor, 176);
  }

  countriesLayer.data.set(fill.data);
  for (let index = 0; index < pixelCount; index += 1) {
    if (countryLines.data[index * 4 + 3] === 0) {
      continue;
    }
    setPixel(countriesLayer, index, lineColor, 255);
  }

  let restoredInternalLinePixels = 0;
  let internalLinePixelsInCountryLayer = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (
      classifications[index] === OWNERSHIP.DARK_LINE &&
      isCountryId(ownership[index])
    ) {
      restoredInternalLinePixels += 1;
    }
    if (boundaryMask[index] === 0 || !isCountryId(ownership[index])) {
      continue;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    let onlySameCountry = true;
    for (const [offsetX, offsetY] of NEIGHBORS_8) {
      const candidateY = y + offsetY;
      if (candidateY < 0 || candidateY >= height) {
        continue;
      }
      const candidateX = (x + offsetX + width) % width;
      const neighborOwner = ownership[candidateY * width + candidateX];
      if (neighborOwner !== ownership[index]) {
        onlySameCountry = false;
        break;
      }
    }
    if (onlySameCountry) {
      internalLinePixelsInCountryLayer += 1;
    }
  }

  return {
    fill,
    provinceLines,
    countryLines,
    countries: countriesLayer,
    cleanIdMap,
    boundaryMask,
    restoredInternalLinePixels,
    countryBoundaryPixels,
    internalLinePixelsInCountryLayer,
  };
}

export function createOwnershipPreview(ownership, countries, width, height) {
  const preview = createPng(width, height);
  const countryById = new Map(
    countries.map((country) => [country.id, hexToRgb(country.color)]),
  );
  for (let index = 0; index < ownership.length; index += 1) {
    const owner = ownership[index];
    if (owner === OWNERSHIP.SEA) {
      setPixel(preview, index, { r: 10, g: 24, b: 40 });
    } else if (owner === OWNERSHIP.UNASSIGNED) {
      setPixel(preview, index, { r: 245, g: 246, b: 246 });
    } else if (owner === OWNERSHIP.TRANSPARENT) {
      setPixel(preview, index, { r: 0, g: 0, b: 0 }, 0);
    } else {
      setPixel(preview, index, countryById.get(owner) ?? { r: 255, g: 0, b: 255 });
    }
  }
  return preview;
}
