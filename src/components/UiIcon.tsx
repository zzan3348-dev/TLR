import { getUiIconPath } from "../data/uiAssets";

type UiIconProps = {
  name: string;
  className?: string;
  alt?: string;
};

export function UiIcon({ name, className, alt = "" }: UiIconProps) {
  const src = getUiIconPath(name);
  if (!src) return null;
  return <img className={`ui-icon${className ? ` ${className}` : ""}`} src={src} alt={alt} aria-hidden={alt ? undefined : true} draggable={false} />;
}
