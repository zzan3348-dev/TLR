import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const [intelligenceSheet, worldControlSheet] = process.argv.slice(2);
if (!intelligenceSheet || !worldControlSheet) {
  throw new Error("사용법: node scripts/extract-world-control-icons.mjs <intelligence-sheet.png> <world-control-sheet.png>");
}

const cells = [
  [0, 0], [512, 0], [1024, 0], [0, 512], [512, 512],
];

async function extract(sheetPath, names, outputDirectory) {
  const image = await loadImage(sheetPath);
  mkdirSync(outputDirectory, { recursive: true });
  for (let index = 0; index < names.length; index += 1) {
    const [x, y] = cells[index];
    const source = createCanvas(512, 512);
    const context = source.getContext("2d");
    context.drawImage(image, x, y, 512, 512, 0, 0, 512, 512);
    const pixels = context.getImageData(0, 0, 512, 512);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const red = pixels.data[offset];
      const green = pixels.data[offset + 1];
      const blue = pixels.data[offset + 2];
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      if (spread < 14 && brightness > 205) pixels.data[offset + 3] = 0;
    }
    context.putImageData(pixels, 0, 0);
    let left = 512;
    let top = 512;
    let right = -1;
    let bottom = -1;
    for (let pixel = 0; pixel < pixels.data.length / 4; pixel += 1) {
      if (pixels.data[pixel * 4 + 3] < 12) continue;
      const pixelX = pixel % 512;
      const pixelY = Math.floor(pixel / 512);
      left = Math.min(left, pixelX);
      top = Math.min(top, pixelY);
      right = Math.max(right, pixelX);
      bottom = Math.max(bottom, pixelY);
    }
    if (right < left || bottom < top) throw new Error(`${names[index]} 아이콘의 불투명 영역을 찾지 못했습니다.`);
    const contentWidth = right - left + 1;
    const contentHeight = bottom - top + 1;
    const safePadding = 6;
    const available = 160 - safePadding * 2;
    const scale = Math.min(available / contentWidth, available / contentHeight);
    const drawWidth = Math.max(1, Math.round(contentWidth * scale));
    const drawHeight = Math.max(1, Math.round(contentHeight * scale));
    const drawX = Math.round((160 - drawWidth) / 2);
    const drawY = Math.round((160 - drawHeight) / 2);
    const output = createCanvas(160, 160);
    const outputContext = output.getContext("2d");
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(source, left, top, contentWidth, contentHeight, drawX, drawY, drawWidth, drawHeight);
    const target = join(outputDirectory, `${names[index]}.png`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output.toBuffer("image/png"));
  }
}

await extract(
  intelligenceSheet,
  ["agency", "defense", "operation", "training", "cipher"],
  "public/assets/ui/generated-icons/intelligence",
);
await extract(
  worldControlSheet,
  ["hold-time", "advance-time", "army-map", "navy-map", "air-map"],
  "public/assets/ui/generated-icons/world-control",
);
