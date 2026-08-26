import type { CSSProperties } from "react";
import {
  normalizeEventImageCrop,
  type EventImageCrop,
} from "../types";

type CroppedEventImageProps = {
  className: string;
  image?: string;
  crop?: Partial<EventImageCrop>;
  alt?: string;
};

export function CroppedEventImage({
  className,
  image,
  crop,
  alt = "",
}: CroppedEventImageProps) {
  const normalizedCrop = normalizeEventImageCrop(crop);
  const imageStyle = {
    objectPosition: `${normalizedCrop.x}% ${normalizedCrop.y}%`,
    transform: `scale(${normalizedCrop.scale})`,
    transformOrigin: `${normalizedCrop.x}% ${normalizedCrop.y}%`,
  } as CSSProperties;

  return (
    <div className={className} data-has-image={Boolean(image)}>
      {image ? (
        <img src={image} alt={alt} draggable={false} style={imageStyle} />
      ) : (
        <span aria-label="이벤트 사진 없음" />
      )}
    </div>
  );
}
