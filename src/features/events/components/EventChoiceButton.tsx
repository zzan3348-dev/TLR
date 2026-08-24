type EventChoiceButtonProps = {
  children: string;
  selected: boolean;
  onClick: () => void;
};

export function EventChoiceButton({
  children,
  selected,
  onClick,
}: EventChoiceButtonProps) {
  return (
    <button
      className="event-choice-button"
      data-selected={selected}
      type="button"
      onClick={onClick}
    >
      <span className="event-choice-button__accent" aria-hidden="true" />
      <span className="eventChoiceText">{children}</span>
    </button>
  );
}
