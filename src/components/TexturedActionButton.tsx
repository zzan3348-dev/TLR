import type {
  ButtonHTMLAttributes,
  PropsWithChildren,
} from "react";

type TexturedActionButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone: "green" | "gray";
    compact?: boolean;
  }
>;

const BUTTON_TEXTURES = {
  green: "/assets/ui/play-button-green.png",
  gray: "/assets/ui/play-button-gray.png",
} as const;

export function TexturedActionButton({
  children,
  tone,
  compact = false,
  className = "",
  type = "button",
  ...buttonProps
}: TexturedActionButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={`textured-action-button ${className}`.trim()}
      data-tone={tone}
      data-compact={compact}
    >
      <img
        src={BUTTON_TEXTURES[tone]}
        alt=""
        draggable={false}
        aria-hidden="true"
      />
      <span>{children}</span>
    </button>
  );
}
