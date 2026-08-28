import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import process from "node:process";

const outputDirectory = process.argv[2];
const sources = process.argv.slice(3);

if (!outputDirectory || sources.length === 0) {
  throw new Error("사용법: node scripts/prepare-military-icons.mjs <출력 폴더> <이름=원본.png> ...");
}

mkdirSync(outputDirectory, { recursive: true });

for (const sourceEntry of sources) {
  const separator = sourceEntry.indexOf("=");
  const requestedName = separator > 0 ? sourceEntry.slice(0, separator) : basename(sourceEntry, extname(sourceEntry));
  const sourcePath = separator > 0 ? sourceEntry.slice(separator + 1) : sourceEntry;
  const image = await loadImage(sourcePath);
  const source = createCanvas(image.width, image.height);
  const sourceContext = source.getContext("2d");
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, image.width, image.height);

  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < pixels.data.length / 4; pixel += 1) {
    if (pixels.data[pixel * 4 + 3] < 10) continue;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error(`${requestedName}: 불투명 영역이 없습니다.`);

  const outputSize = 256;
  const safetyMargin = 18;
  const contentWidth = right - left + 1;
  const contentHeight = bottom - top + 1;
  const scale = Math.min(
    (outputSize - safetyMargin * 2) / contentWidth,
    (outputSize - safetyMargin * 2) / contentHeight,
  );
  const drawWidth = Math.round(contentWidth * scale);
  const drawHeight = Math.round(contentHeight * scale);
  const output = createCanvas(outputSize, outputSize);
  const outputContext = output.getContext("2d");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(
    source,
    left,
    top,
    contentWidth,
    contentHeight,
    Math.round((outputSize - drawWidth) / 2),
    Math.round((outputSize - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );
  const target = join(outputDirectory, `${requestedName}.png`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output.toBuffer("image/png"));
  console.log(`${requestedName}: ${contentWidth}x${contentHeight} -> ${outputSize}x${outputSize}`);
}
