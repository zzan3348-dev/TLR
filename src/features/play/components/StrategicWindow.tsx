import { useState, type PropsWithChildren, type ReactNode } from "react";
import { UiIcon } from "../../../components/UiIcon";
import { MobileSheetHandle, type MobileSheetState } from "./MobileSheetHandle";

type StrategicWindowProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  headerControls?: ReactNode;
  className?: string;
  onClose: () => void;
}>;

export function StrategicWindow({
  title,
  eyebrow,
  actions,
  headerControls,
  className,
  onClose,
  children,
}: StrategicWindowProps) {
  const [mobileSheetState, setMobileSheetState] = useState<MobileSheetState>("half");

  return (
    <aside
      className={`strategic-window${className ? ` ${className}` : ""}`}
      aria-label={title}
      data-mobile-sheet-state={mobileSheetState}
    >
      <MobileSheetHandle state={mobileSheetState} onChange={setMobileSheetState} label={title} />
      <header className="strategic-window__chrome">
        <div>
          {eyebrow ? <small>{eyebrow}</small> : null}
          <h2>{title}</h2>
        </div>
        {headerControls}
        <button type="button" onClick={onClose} aria-label={`${title} 닫기`}>
          <UiIcon name="ui/close" />
        </button>
      </header>
      {actions ? (
        <div className="strategic-window__actions">{actions}</div>
      ) : null}
      <div className="strategic-window__body">{children}</div>
    </aside>
  );
}

export function PlaceholderLineGraph({
  values,
}: {
  values: readonly number[];
}) {
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 28 - (value / max) * 26;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      className="placeholder-line-graph"
      viewBox="0 0 100 30"
      role="img"
      aria-label="경제 추이 그래프"
      preserveAspectRatio="none"
    >
      <polyline points={points} />
      <line x1="0" y1="28" x2="100" y2="28" />
    </svg>
  );
}
