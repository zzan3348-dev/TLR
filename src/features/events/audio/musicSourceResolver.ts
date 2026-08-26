import type { SuperEventMusic } from "../types";

export type ResolvedSuperEventMusicSource =
  | { kind: "native"; source: string }
  | { kind: "youtube"; videoId: string; embedUrl: string };

export function extractYouTubeVideoId(source: string): string | null {
  try {
    const url = new URL(source);
    const host = url.hostname.replace(/^www\./u, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host !== "youtube.com" && host !== "m.youtube.com") return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    return ["embed", "shorts", "live"].includes(parts[0] ?? "") ? parts[1] ?? null : null;
  } catch {
    return null;
  }
}

export function resolveSuperEventMusicSource(
  music: SuperEventMusic,
  origin = typeof window === "undefined" ? "https://localhost" : window.location.origin,
): ResolvedSuperEventMusicSource | null {
  const source = music.source.trim();
  if (!source) return null;
  if (music.sourceType !== "youtube") return { kind: "native", source };

  const videoId = extractYouTubeVideoId(source);
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/u.test(videoId)) return null;
  const parameters = new URLSearchParams({
    autoplay: "1",
    controls: "0",
    disablekb: "1",
    enablejsapi: "1",
    playsinline: "1",
    origin,
  });
  if (music.startTime && music.startTime > 0) parameters.set("start", String(Math.floor(music.startTime)));
  if (music.endTime && music.endTime > 0) parameters.set("end", String(Math.floor(music.endTime)));
  return {
    kind: "youtube",
    videoId,
    embedUrl: `https://www.youtube.com/embed/${videoId}?${parameters.toString()}`,
  };
}
