export const EVENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const EVENT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function eventImageError(type: string, size: number): string | null {
  if (!(EVENT_IMAGE_MIME_TYPES as readonly string[]).includes(type)) return "지원하지 않는 이미지 형식입니다. JPG·PNG·WebP를 선택하세요.";
  if (!Number.isSafeInteger(size) || size <= 0) return "빈 이미지 파일입니다.";
  if (size > EVENT_IMAGE_MAX_BYTES) return "이미지 용량이 너무 큽니다. 8MB 이하를 선택하세요.";
  return null;
}
