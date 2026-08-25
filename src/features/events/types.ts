export type EventTemplateType = "document" | "newspaper";

export type EventChoice = {
  id: string;
  label: string;
};

export type EventImageCrop = {
  /** Horizontal focal point as a percentage from 0 to 100. */
  x: number;
  /** Vertical focal point as a percentage from 0 to 100. */
  y: number;
  /** Non-destructive display zoom. Values below 1 are normalized to 1. */
  scale: number;
};

export type NewspaperEventData = {
  id: string;
  title: string;
  body: string;
  image?: string;
  imageCrop?: EventImageCrop;
  choices?: readonly EventChoice[];
};

export const DEFAULT_EVENT_IMAGE_CROP: Readonly<EventImageCrop> = {
  x: 50,
  y: 50,
  scale: 1,
};

export function normalizeEventImageCrop(
  crop?: Partial<EventImageCrop>,
): EventImageCrop {
  const clamp = (value: number | undefined, minimum: number, maximum: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, value))
      : fallback;

  return {
    x: clamp(crop?.x, 0, 100, DEFAULT_EVENT_IMAGE_CROP.x),
    y: clamp(crop?.y, 0, 100, DEFAULT_EVENT_IMAGE_CROP.y),
    scale: clamp(crop?.scale, 1, 4, DEFAULT_EVENT_IMAGE_CROP.scale),
  };
}
