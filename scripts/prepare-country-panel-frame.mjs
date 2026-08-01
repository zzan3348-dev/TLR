import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(
  projectRoot,
  "public",
  "assets",
  "ui",
  "country-panel-source.png",
);
const framePath = path.join(
  projectRoot,
  "public",
  "assets",
  "ui",
  "country-panel-frame.png",
);
const frameOverlayPath = path.join(
  projectRoot,
  "public",
  "assets",
  "ui",
  "country-panel-frame-overlay.png",
);
const portraitOpening = {
  x: 17,
  y: 148,
  width: 220,
  height: 287,
};
const emblemOpening = {
  x: 53,
  y: 24,
  width: 153,
  height: 80,
  exponent: 5,
};

function clearRectangularOpening(image, opening) {
  for (let y = opening.y; y < opening.y + opening.height; y += 1) {
    for (let x = opening.x; x < opening.x + opening.width; x += 1) {
      image.data[(y * image.width + x) * 4 + 3] = 0;
    }
  }
}

function clearSuperellipseOpening(image, opening) {
  const sampleGridSize = 8;
  const sampleCount = sampleGridSize * sampleGridSize;
  const centerX = opening.x + opening.width / 2;
  const centerY = opening.y + opening.height / 2;
  const radiusX = opening.width / 2;
  const radiusY = opening.height / 2;

  for (let y = opening.y - 1; y <= opening.y + opening.height; y += 1) {
    for (let x = opening.x - 1; x <= opening.x + opening.width; x += 1) {
      let insideSamples = 0;

      for (let sampleY = 0; sampleY < sampleGridSize; sampleY += 1) {
        for (let sampleX = 0; sampleX < sampleGridSize; sampleX += 1) {
          const pointX = x + (sampleX + 0.5) / sampleGridSize;
          const pointY = y + (sampleY + 0.5) / sampleGridSize;
          const normalizedX = Math.abs((pointX - centerX) / radiusX);
          const normalizedY = Math.abs((pointY - centerY) / radiusY);
          const inside =
            normalizedX ** opening.exponent +
              normalizedY ** opening.exponent <=
            1;

          if (inside) {
            insideSamples += 1;
          }
        }
      }

      if (insideSamples === 0) {
        continue;
      }

      const alphaIndex = (y * image.width + x) * 4 + 3;
      const retainedCoverage = 1 - insideSamples / sampleCount;
      image.data[alphaIndex] = Math.round(
        image.data[alphaIndex] * retainedCoverage,
      );
    }
  }
}

function findOpaqueBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("Country panel source contains no opaque pixels.");
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cropImage(image, bounds) {
  const output = new PNG({ width: bounds.width, height: bounds.height });

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const sourceIndex =
        ((bounds.y + y) * image.width + bounds.x + x) * 4;
      const outputIndex = (y * output.width + x) * 4;
      image.data.copy(output.data, outputIndex, sourceIndex, sourceIndex + 4);
    }
  }

  return output;
}

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const bounds = findOpaqueBounds(source);
const frame = cropImage(source, bounds);

if (frame.width !== 822 || frame.height !== 1022) {
  throw new Error(
    `Unexpected panel bounds: ${frame.width}x${frame.height}`,
  );
}

fs.writeFileSync(framePath, PNG.sync.write(frame));

const frameOverlay = PNG.sync.read(PNG.sync.write(frame));
clearSuperellipseOpening(frameOverlay, emblemOpening);
clearRectangularOpening(frameOverlay, portraitOpening);
fs.writeFileSync(frameOverlayPath, PNG.sync.write(frameOverlay));

console.log(
  JSON.stringify(
    {
      source: path.relative(projectRoot, sourcePath),
      bounds,
      outputSize: {
        width: frame.width,
        height: frame.height,
      },
      frame: path.relative(projectRoot, framePath),
      frameOverlay: path.relative(projectRoot, frameOverlayPath),
      emblemOpening,
      portraitOpening,
      preservesOriginalSlots: true,
    },
    null,
    2,
  ),
);
