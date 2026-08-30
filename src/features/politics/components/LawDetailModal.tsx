import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LawDefinition } from "../types/laws";
import { UiIcon } from "../../../components/UiIcon";
import { getLawDisplayIcon, getLawStageIcon } from "./lawIcon";
import {
  evaluateLawAvailability,
  type LawAvailability,
  type LawAvailabilityContext,
} from "../utils/lawAvailability";

type LawDetailModalProps = {
  definition: LawDefinition | null;
  selectedOptionId: string | null;
  availabilityContext: LawAvailabilityContext;
  definitions: readonly LawDefinition[];
  onSelect: (lawId: string, optionId: string) => void;
  onClose: () => void;
};

export function LawDetailModal({
  definition,
  selectedOptionId,
  availabilityContext,
  definitions,
  onSelect,
  onClose,
}: LawDetailModalProps) {
  const [tooltip, setTooltip] = useState<{
    optionId: string;
    evaluation: LawAvailability;
    x: number;
    y: number;
  } | null>(null);
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

  const optionsWithAvailability = useMemo(
    () => definition
      ? definition.options.map((option) => ({
          option,
          evaluation: evaluateLawAvailability(definition, option, availabilityContext, definitions),
        }))
      : [],
    [availabilityContext, definition, definitions],
  );

  if (!definition) {
    return null;
  }

  const selectedOption =
    definition.options.find((option) => option.id === selectedOptionId) ??
    null;

  const showTooltip = (
    optionId: string,
    evaluation: LawAvailability,
    clientX: number,
    clientY: number,
  ) => {
    const width = Math.min(410, window.innerWidth - 24);
    const height = Math.min(620, window.innerHeight - 24);
    const right = clientX + 18 + width;
    const bottom = clientY + 18 + height;
    setTooltip({
      optionId,
      evaluation,
      x: Math.max(12, right > window.innerWidth - 12 ? clientX - width - 18 : clientX + 18),
      y: Math.max(12, bottom > window.innerHeight - 12 ? window.innerHeight - height - 12 : clientY + 18),
    });
  };

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
          <UiIcon
            name={getLawDisplayIcon(definition.id, selectedOption?.order)}
          />
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
          {optionsWithAvailability.map(({ option, evaluation }) => {
            const active = option.id === selectedOptionId;
            return (
              <div
                key={option.id}
                className="law-detail-modal__option-wrap"
                data-active={active}
                data-state={active ? "active" : evaluation.state}
                onPointerEnter={(event) => showTooltip(option.id, evaluation, event.clientX, event.clientY)}
                onPointerMove={(event) => showTooltip(option.id, evaluation, event.clientX, event.clientY)}
                onPointerLeave={() => setTooltip(null)}
              >
                <button
                  type="button"
                  aria-disabled={active || !evaluation.canSelect}
                  aria-describedby={tooltip?.optionId === option.id ? `law-option-tooltip-${option.id}` : undefined}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    showTooltip(option.id, evaluation, rect.right, rect.top);
                  }}
                  onBlur={() => setTooltip(null)}
                  onClick={() => {
                    if (!active && evaluation.canSelect) onSelect(definition.id, option.id);
                  }}
                >
                  <UiIcon
                    name={getLawStageIcon(definition.id, option.order)}
                    className="law-detail-modal__option-icon"
                  />
                  <div>
                    <strong>{option.name}</strong>
                    <p>{option.description}</p>
                    <small>
                      {option.effectLines && option.effectLines.length > 0
                        ? option.effectLines.join(" · ")
                        : "등록된 상시 수치 효과 없음"}
                    </small>
                  </div>
                  <i aria-hidden="true">{active ? "적용 중" : evaluation.statusLabel}</i>
                </button>
              </div>
            );
          })}
        </div>
      </section>
      {tooltip ? (() => {
        const option = definition.options.find((candidate) => candidate.id === tooltip.optionId);
        if (!option) return null;
        return createPortal(
          <aside
            id={`law-option-tooltip-${option.id}`}
            className="law-option-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            role="tooltip"
          >
            <header>
              <h3>{option.name}</h3>
              <span data-state={tooltip.evaluation.state}>{tooltip.evaluation.statusLabel}</span>
            </header>
            <p>{option.description}</p>
            <div className="law-option-tooltip__comparison">
              <span>현재</span><strong>{selectedOption?.name ?? "미설정"}</strong>
              <span>변경</span><strong>{option.name}</strong>
            </div>
            <section>
              <h4>해금 조건</h4>
              <ul>
                {tooltip.evaluation.requirements.map((item) => (
                  <li key={item.id} data-tone={item.tone}>
                    <b aria-hidden="true">{item.tone === "pass" ? "✓" : item.tone === "fail" ? "✕" : "△"}</b>
                    <div><span>{item.label}</span>{item.current ? <small>{item.current}</small> : null}</div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4>변경 비용</h4>
              <ul>
                {tooltip.evaluation.costs.map((item) => (
                  <li key={item.id} data-tone={item.tone}>
                    <b aria-hidden="true">{item.tone === "pass" ? "✓" : "✕"}</b>
                    <div><span>{item.label}</span>{item.current ? <small>{item.current}</small> : null}</div>
                  </li>
                ))}
              </ul>
              <dl>
                <div><dt>시행 기간</dt><dd>{option.implementationTurns}턴</dd></div>
                <div><dt>재변경 쿨다운</dt><dd>{option.changeCooldownTurns}턴</dd></div>
              </dl>
            </section>
            <section>
              <h4>선택 시 효과</h4>
              {option.effectLines && option.effectLines.length > 0 ? (
                <ul className="law-option-tooltip__effects">
                  {option.effectLines.map((line, index) => <li key={`${index}:${line}`} data-tone="neutral"><div><span>{line}</span></div></li>)}
                </ul>
              ) : <p className="law-option-tooltip__empty">등록된 상시 수치 효과가 없습니다.</p>}
            </section>
          </aside>,
          document.body,
        );
      })() : null}
    </div>
  );
}
