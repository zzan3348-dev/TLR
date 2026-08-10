import type { LawDefinition, LawOption } from "../types/laws";
import { UiIcon } from "../../../components/UiIcon";
import { getLawDisplayIcon } from "./lawIcon";

type LawCardProps = {
  definition: LawDefinition;
  selectedOption: LawOption | null;
  onOpen: (definition: LawDefinition) => void;
};

export function LawCard({
  definition,
  selectedOption,
  onOpen,
}: LawCardProps) {
  const selectedIndex = selectedOption
    ? definition.options.findIndex(
        (option) => option.id === selectedOption.id,
      )
    : -1;

  return (
    <button
      type="button"
      className="law-card"
      data-state={selectedOption ? "active" : "unset"}
      onClick={() => onOpen(definition)}
      aria-label={`${definition.name}: ${selectedOption?.name ?? "미설정"}`}
    >
      <span className="law-card__icon">
        <UiIcon
          name={getLawDisplayIcon(definition.id, selectedOption?.order)}
        />
      </span>
      <span className="law-card__copy">
        <strong>{definition.name}</strong>
        <b data-unset={!selectedOption}>
          {selectedOption?.name ?? "미설정"}
        </b>
        <span
          className="law-card__spectrum"
          aria-label={`${definition.options.length}단계 중 ${
            selectedIndex >= 0 ? selectedIndex + 1 : "미설정"
          }`}
        >
          {definition.options.map((option, index) => (
        <i
              key={option.id}
              data-active={index === selectedIndex}
              aria-hidden="true"
            />
          ))}
        </span>
      </span>
      <span className="law-card__open"><UiIcon name="ui/open" /></span>
    </button>
  );
}
