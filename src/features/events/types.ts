import type { EventEffect } from "../effects/types";

export type EventTemplateType = "document" | "newspaper" | "super";

export type EventChoice = {
  id: string;
  text: string;
  description?: string;
  effects?: readonly EventEffect[];
};

export type DocumentEventData = {
  id: string;
  instanceId: string;
  title: string;
  body: readonly string[];
  choices: readonly EventChoice[];
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
  instanceId: string;
  title: string;
  body: string;
  image?: string;
  imageCrop?: EventImageCrop;
  choices?: readonly EventChoice[];
};

export type SuperEventMusicSourceType = "upload" | "url" | "youtube";

export type SuperEventMusic = {
  sourceType: SuperEventMusicSourceType;
  source: string;
  startTime?: number;
  endTime?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
};

export type SuperEventProjectorAudio = {
  start?: string;
  loop?: string;
  stop?: string;
};

export type SuperEventProjectionEffect = {
  grain?: number;
  flicker?: number;
  jitter?: number;
  vignette?: number;
  dust?: number;
};

export type SuperEventData = {
  id: string;
  instanceId: string;
  title: string;
  image?: string;
  imageCrop?: EventImageCrop;
  quote?: string;
  attribution?: string;
  choice: EventChoice;
  music?: SuperEventMusic;
  projectorAudio?: SuperEventProjectorAudio;
  projectionEffect?: SuperEventProjectionEffect;
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
