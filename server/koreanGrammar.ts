type ParticlePair = "은/는" | "이/가" | "을/를" | "과/와";

export function hasKoreanFinalConsonant(text: string): boolean {
  const code = text.trim().charCodeAt(text.trim().length - 1);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export function withKoreanParticle(text: string, pair: ParticlePair): string {
  const [withFinal, withoutFinal] = pair.split("/");
  return `${text}${hasKoreanFinalConsonant(text) ? withFinal : withoutFinal}`;
}
