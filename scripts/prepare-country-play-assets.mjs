import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const uiDirectory = path.join(projectRoot, "public", "assets", "ui");
const sourcePath = path.join(
  uiDirectory,
  "play-dialog-controls-source.png",
);

const crops = [
  {
    name: "play-confirmation-frame.png",
    x: 154,
    y: 56,
    width: 1229,
    height: 500,
  },
  {
    name: "play-button-green.png",
    x: 45,
    y: 768,
    width: 680,
    height: 208,
  },
  {
    name: "play-button-gray.png",
    x: 811,
    y: 768,
    width: 680,
    height: 208,
  },
];

function cropImage(image, crop) {
  const output = new PNG({ width: crop.width, height: crop.height });

  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const sourceIndex =
        ((crop.y + y) * image.width + crop.x + x) * 4;
      const outputIndex = (y * output.width + x) * 4;
      image.data.copy(output.data, outputIndex, sourceIndex, sourceIndex + 4);
    }
  }

  return output;
}

const source = PNG.sync.read(fs.readFileSync(sourcePath));

for (const crop of crops) {
  const outputPath = path.join(uiDirectory, crop.name);
  fs.writeFileSync(outputPath, PNG.sync.write(cropImage(source, crop)));
}

console.log(
  JSON.stringify(
    {
      source: path.relative(projectRoot, sourcePath),
      outputs: crops.map(({ name, ...bounds }) => ({
        path: path.relative(projectRoot, path.join(uiDirectory, name)),
        bounds,
      })),
    },
    null,
    2,
  ),
);
