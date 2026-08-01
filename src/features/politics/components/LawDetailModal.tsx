import { useEffect } from "react";
import type { LawDefinition } from "../types/laws";
import { UiIcon } from "../../../components/UiIcon";
import { getLawIcon, getLawStageIcon } from "./lawIcon";

type LawDetailModalProps = {
  definition: LawDefinition | null;
  selectedOptionId: string | null;
  onSelect: (lawId: string, optionId: string) => void;
  onClose: () => void;
};

export function LawDetailModal({
  definition,
  selectedOptionId,
  onSelect,
  onClose,
}: LawDetailModalProps) {
  useEffect(() => {
    if (!definition) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [definition, onClose]);

  if (!definition) {
    return null;
  }

  const selectedOption =
    definition.options.find((option) => option.id === selectedOptionId) ??
    null;

  return (
    <div className="law-detail-layer" role="presentation">
      <button
        type="button"
        className="law-detail-layer__backdrop"
        onClick={onClose}
        aria-label="법률 상세창 닫기"
      />
      <section
        className="law-detail-modal"
        data-law-category={definition.category}
        role="dialog"
        aria-modal="true"
        aria-labelledby="law-detail-title"
      >
        <header>
          <UiIcon name={getLawIcon(definition.id)} />
          <div>
            <small>법률 분야</small>
            <h2 id="law-detail-title">{definition.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            <UiIcon name="ui/close" />
          </button>
        </header>
        <p className="law-detail-modal__description">
          {definition.description}
        </p>
        <div className="law-detail-modal__current">
          <span>현재 법률</span>
          <strong>{selectedOption?.name ?? "미설정"}</strong>
        </div>
        <div className="law-detail-modal__options">
          {definition.options.map((option) => {
            const active = option.id === selectedOptionId;
            return (
              <button
                key={option.id}
                type="button"
                data-active={active}
                data-state={active ? "active" : "available"}
                onClick={() => onSelect(definition.id, option.id)}
              >
                <UiIcon
                  name={getLawStageIcon(definition.id, option.order)}
                  className="law-detail-modal__option-icon"
                />
                <div>
                  <strong>{option.name}</strong>
                  <p>{option.description}</p>
                  <small>
                    {option.modifiers.length > 0
                      ? option.modifiers
                          .map(
                            (modifier) =>
                              `${modifier.key} ${modifier.value}${
                                modifier.unit === "percent" ? "%" : ""
                              }`,
                          )
                          .join(" · ")
                      : "효과 수치는 향후 국가 계산 시스템과 연결됩니다."}
                  </small>
                </div>
                <i aria-hidden="true">{active ? "적용 중" : "선택"}</i>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
