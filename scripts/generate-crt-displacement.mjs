import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const size = 512;
const png = new PNG({ width: size, height: size, colorType: 6 });

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const normalizedX = (x / (size - 1)) * 2 - 1;
    const normalizedY = (y / (size - 1)) * 2 - 1;
    const radiusSquared = normalizedX * normalizedX + normalizedY * normalizedY;
    const horizontalDisplacement = Math.max(-0.48, Math.min(0.48, normalizedX * radiusSquared * 0.23));
    const verticalDisplacement = Math.max(-0.48, Math.min(0.48, normalizedY * radiusSquared * 0.23));
    const offset = (y * size + x) * 4;

    png.data[offset] = Math.round((0.5 + horizontalDisplacement) * 255);
    png.data[offset + 1] = Math.round((0.5 + verticalDisplacement) * 255);
    png.data[offset + 2] = 128;
    png.data[offset + 3] = 255;
  }
}

const outputPath = resolve("public/assets/title/crt-barrel-displacement.png");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, PNG.sync.write(png));
console.log(`Generated ${outputPath}`);
