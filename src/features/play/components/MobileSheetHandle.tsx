import { useRef, type PointerEvent } from "react";

export type MobileSheetState = "collapsed" | "half" | "full";

type MobileSheetHandleProps = {
  state: MobileSheetState;
  onChange: (state: MobileSheetState) => void;
  label: string;
};

const NEXT_STATE: Record<MobileSheetState, MobileSheetState> = {
  collapsed: "half",
  half: "full",
  full: "half",
};

export function MobileSheetHandle({ state, onChange, label }: MobileSheetHandleProps) {
  const startY = useRef<number | null>(null);

  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (startY.current === null) return;
    const distance = event.clientY - startY.current;
    startY.current = null;
    if (distance < -42) onChange("full");
    else if (distance > 42) onChange("collapsed");
    else onChange(NEXT_STATE[state]);
  };

  return (
    <button
      type="button"
      className="mobile-sheet-handle"
      aria-label={`${label} ${state === "full" ? "절반 크기로 줄이기" : "크게 보기"}`}
      aria-expanded={state !== "collapsed"}
      onPointerDown={(event) => {
        startY.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finish}
      onPointerCancel={() => { startY.current = null; }}
    >
      <span aria-hidden="true" />
      <small>{state === "full" ? "아래로 밀어 줄이기" : state === "half" ? "위로 밀어 크게 보기" : "눌러 열기"}</small>
    </button>
  );
}
