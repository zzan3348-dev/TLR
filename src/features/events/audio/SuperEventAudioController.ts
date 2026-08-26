import type {
  SuperEventMusic,
  SuperEventProjectorAudio,
} from "../types";
import { resolveSuperEventMusicSource } from "./musicSourceResolver";

const clampVolume = (value: number | undefined, fallback: number) =>
  Math.min(1, Math.max(0, value ?? fallback));

export class SuperEventAudioController {
  private musicAudio: HTMLAudioElement | null = null;
  private projectorLoop: HTMLAudioElement | null = null;
  private youtubeFrame: HTMLIFrameElement | null = null;
  private timers = new Set<number>();

  private rememberTimer(timer: number): number {
    this.timers.add(timer);
    return timer;
  }

  private safePlay(audio: HTMLAudioElement): void {
    void audio.play().catch(() => undefined);
  }

  private playOneShot(source: string | undefined, volume: number): void {
    if (!source) return;
    const audio = new Audio(source);
    audio.volume = volume;
    this.safePlay(audio);
  }

  startProjector(audio?: SuperEventProjectorAudio): void {
    if (!audio) return;
    this.playOneShot(audio.start, 0.32);
    if (audio.loop) {
      this.projectorLoop?.pause();
      this.projectorLoop = new Audio(audio.loop);
      this.projectorLoop.loop = true;
      this.projectorLoop.volume = 0.12;
      this.safePlay(this.projectorLoop);
    }
  }

  startMusic(music?: SuperEventMusic): void {
    if (!music) return;
    const resolved = resolveSuperEventMusicSource(music);
    if (!resolved) return;
    const targetVolume = clampVolume(music.volume, 0.7);
    const fadeInMs = Math.max(0, (music.fadeIn ?? 0.8) * 1000);

    if (resolved.kind === "native") {
      const audio = new Audio(resolved.source);
      this.musicAudio = audio;
      audio.preload = "auto";
      audio.volume = fadeInMs ? 0 : targetVolume;
      const seek = () => {
        if (music.startTime && Number.isFinite(music.startTime)) audio.currentTime = music.startTime;
      };
      audio.addEventListener("loadedmetadata", seek, { once: true });
      this.safePlay(audio);
      this.fadeNativeAudio(audio, targetVolume, fadeInMs);
      if (music.endTime && music.endTime > (music.startTime ?? 0)) {
        this.rememberTimer(window.setTimeout(() => this.fadeNativeAudio(audio, 0, 350), (music.endTime - (music.startTime ?? 0)) * 1000));
      }
      return;
    }

    const frame = document.createElement("iframe");
    frame.className = "super-event-audio-frame";
    frame.src = resolved.embedUrl;
    frame.title = "슈퍼이벤트 음악 재생기";
    frame.allow = "autoplay; encrypted-media";
    frame.setAttribute("aria-hidden", "true");
    document.body.append(frame);
    this.youtubeFrame = frame;
    frame.addEventListener("load", () => {
      this.postYouTube("setVolume", [Math.round(targetVolume * 100)]);
      this.postYouTube("playVideo");
    }, { once: true });
  }

  private postYouTube(func: string, args: unknown[] = []): void {
    this.youtubeFrame?.contentWindow?.postMessage(JSON.stringify({
      event: "command",
      func,
      args,
    }), "https://www.youtube.com");
  }

  private fadeNativeAudio(audio: HTMLAudioElement, target: number, durationMs: number): void {
    if (durationMs <= 0) {
      audio.volume = target;
      if (target === 0) audio.pause();
      return;
    }
    const initial = audio.volume;
    const started = performance.now();
    const interval = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / durationMs);
      audio.volume = initial + (target - initial) * progress;
      if (progress >= 1) {
        window.clearInterval(interval);
        this.timers.delete(interval);
        if (target === 0) audio.pause();
      }
    }, 40);
    this.rememberTimer(interval);
  }

  stop(music: SuperEventMusic | undefined, projectorAudio?: SuperEventProjectorAudio): void {
    const fadeOutMs = Math.max(150, (music?.fadeOut ?? 0.65) * 1000);
    if (this.musicAudio) this.fadeNativeAudio(this.musicAudio, 0, fadeOutMs);
    if (this.youtubeFrame) {
      this.postYouTube("setVolume", [0]);
      this.rememberTimer(window.setTimeout(() => this.postYouTube("stopVideo"), fadeOutMs));
    }
    this.projectorLoop?.pause();
    this.projectorLoop = null;
    this.playOneShot(projectorAudio?.stop, 0.28);
  }

  dispose(): void {
    for (const timer of this.timers) {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    }
    this.timers.clear();
    this.musicAudio?.pause();
    this.musicAudio = null;
    this.projectorLoop?.pause();
    this.projectorLoop = null;
    this.postYouTube("stopVideo");
    this.youtubeFrame?.remove();
    this.youtubeFrame = null;
  }
}
