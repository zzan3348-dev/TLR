import type { ReactNode } from "react";
import { UiIcon } from "../../../components/UiIcon";
import { StrategicWindow } from "../../play/components/StrategicWindow";

type DiplomacyWindowShellProps = {
  eyebrow: string;
  header: ReactNode;
  summary: ReactNode;
  actions: ReactNode;
  onClose: () => void;
};

export function DiplomacyWindowShell({
  eyebrow,
  header,
  summary,
  actions,
  onClose,
}: DiplomacyWindowShellProps) {
  return (
    <StrategicWindow
      title="외교"
      eyebrow={eyebrow}
      className="strategic-window--diplomacy"
      onClose={onClose}
    >
      <div className="diplomacy-shell__header">{header}</div>
      <div className="diplomacy-shell__summary">{summary}</div>
      <section className="diplomacy-shell__actions">
        <header>
          <UiIcon name="menu/diplomacy" />
          <h3>외교 행동</h3>
          <small>선택 가능한 국가 간 행동</small>
        </header>
        <div className="diplomacy-shell__action-list">{actions}</div>
      </section>
    </StrategicWindow>
  );
}
