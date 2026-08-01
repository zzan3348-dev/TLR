import type { ViewportSize } from "../types/mapCountry";

function drawRivet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  const rivet = context.createRadialGradient(
    x - 1.5,
    y - 1.5,
    0.5,
    x,
    y,
    5,
  );
  rivet.addColorStop(0, "#777b7b");
  rivet.addColorStop(0.32, "#414647");
  rivet.addColorStop(0.72, "#1b2022");
  rivet.addColorStop(1, "#080b0c");
  context.beginPath();
  context.arc(x, y, 5, 0, Math.PI * 2);
  context.fillStyle = rivet;
  context.fill();
  context.beginPath();
  context.arc(x - 1.2, y - 1.3, 1, 0, Math.PI * 2);
  context.fillStyle = "rgba(236, 231, 213, 0.3)";
  context.fill();
}

export function drawMapSteelBackdrop(
  context: CanvasRenderingContext2D,
  viewport: ViewportSize,
  pixelRatio: number,
): void {
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const verticalSteel = context.createLinearGradient(
    0,
    0,
    0,
    viewport.height,
  );
  verticalSteel.addColorStop(0, "#292d2f");
  verticalSteel.addColorStop(0.12, "#202426");
  verticalSteel.addColorStop(0.5, "#15191b");
  verticalSteel.addColorStop(0.88, "#202426");
  verticalSteel.addColorStop(1, "#2a2e30");
  context.fillStyle = verticalSteel;
  context.fillRect(0, 0, viewport.width, viewport.height);

  const horizontalSheen = context.createLinearGradient(
    0,
    0,
    viewport.width,
    0,
  );
  horizontalSheen.addColorStop(0, "rgba(0, 0, 0, 0.32)");
  horizontalSheen.addColorStop(0.18, "rgba(255, 255, 255, 0.025)");
  horizontalSheen.addColorStop(0.5, "rgba(255, 255, 255, 0.055)");
  horizontalSheen.addColorStop(0.82, "rgba(255, 255, 255, 0.018)");
  horizontalSheen.addColorStop(1, "rgba(0, 0, 0, 0.36)");
  context.fillStyle = horizontalSheen;
  context.fillRect(0, 0, viewport.width, viewport.height);

  for (let patchIndex = 0; patchIndex < 9; patchIndex += 1) {
    const x =
      ((patchIndex * 0.173 + 0.08) % 1) * viewport.width;
    const y =
      ((patchIndex * 0.317 + 0.11) % 1) * viewport.height;
    const radius =
      54 + ((patchIndex * 37) % 92);
    const grime = context.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      radius,
    );
    grime.addColorStop(0, "rgba(3, 5, 6, 0.16)");
    grime.addColorStop(0.45, "rgba(24, 18, 13, 0.075)");
    grime.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = grime;
    context.fillRect(
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
    );
  }

  for (let y = 2; y < viewport.height; y += 4) {
    context.fillStyle =
      y % 12 === 2
        ? "rgba(0, 0, 0, 0.11)"
        : "rgba(226, 229, 224, 0.018)";
    context.fillRect(0, y, viewport.width, 1);
  }

  const scratchCount = Math.max(
    90,
    Math.round(viewport.width / 8),
  );
  for (let index = 0; index < scratchCount; index += 1) {
    const seed = Math.abs(
      Math.sin((index + 1) * 12.9898) * 43_758.5453,
    );
    const fraction = seed - Math.floor(seed);
    const x = fraction * viewport.width;
    const y =
      ((index * 47.37 + fraction * 113) % viewport.height);
    const length = 4 + ((index * 17) % 42);
    const bright = index % 3 === 0;
    context.strokeStyle = bright
      ? "rgba(218, 217, 205, 0.07)"
      : "rgba(0, 0, 0, 0.16)";
    context.lineWidth = index % 11 === 0 ? 1.4 : 0.7;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(
      Math.min(viewport.width, x + length),
      y + ((index % 5) - 2) * 0.35,
    );
    context.stroke();
  }

  for (const seamRatio of [0.25, 0.5, 0.75]) {
    const seamX = Math.round(viewport.width * seamRatio);
    context.fillStyle = "rgba(0, 0, 0, 0.27)";
    context.fillRect(seamX, 0, 1, viewport.height);
    context.fillStyle = "rgba(214, 213, 201, 0.055)";
    context.fillRect(seamX + 1, 0, 1, viewport.height);
  }

  context.fillStyle = "rgba(0, 0, 0, 0.48)";
  context.fillRect(0, 0, viewport.width, 2);
  context.fillRect(0, viewport.height - 2, viewport.width, 2);
  context.fillStyle = "rgba(204, 205, 195, 0.12)";
  context.fillRect(0, 2, viewport.width, 1);
  context.fillRect(0, viewport.height - 3, viewport.width, 1);
  context.fillStyle = "rgba(0, 0, 0, 0.22)";
  context.fillRect(0, 6, viewport.width, 2);
  context.fillRect(0, viewport.height - 8, viewport.width, 2);
  context.fillStyle = "rgba(221, 220, 207, 0.055)";
  context.fillRect(0, 8, viewport.width, 1);
  context.fillRect(0, viewport.height - 9, viewport.width, 1);

  const rivetInset = 18;
  for (const [x, y] of [
    [rivetInset, rivetInset],
    [viewport.width - rivetInset, rivetInset],
    [rivetInset, viewport.height - rivetInset],
    [viewport.width - rivetInset, viewport.height - rivetInset],
  ]) {
    drawRivet(context, x, y);
  }

  context.restore();
}

export function createMapSteelBackdropLayer(
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  drawMapSteelBackdrop(
    context,
    { width: canvas.width, height: canvas.height },
    1,
  );
  return canvas;
}
