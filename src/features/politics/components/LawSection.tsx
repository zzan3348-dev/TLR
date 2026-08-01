import { useState } from "react";
import type { LawDefinition } from "../types/laws";
import { LawCard } from "./LawCard";
import { UiIcon } from "../../../components/UiIcon";

type LawSectionProps = {
  id: string;
  title: string;
  icon: string;
  definitions: readonly LawDefinition[];
  choices: Readonly<Record<string, string>>;
  onOpenLaw: (definition: LawDefinition) => void;
};

export function LawSection({
  id,
  title,
  icon,
  definitions,
  choices,
  onOpenLaw,
}: LawSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="law-section" data-category={id} data-expanded={expanded}>
      <button
        type="button"
        className="law-section__heading"
        data-state={expanded ? "expanded" : "collapsed"}
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={`${id}-law-grid`}
      >
        <UiIcon name={icon} />
        <h2>{title}</h2>
        <UiIcon name={expanded ? "ui/collapse" : "ui/expand"} />
      </button>
      {expanded ? (
        <div className="law-section__grid" id={`${id}-law-grid`}>
          {definitions.map((definition) => (
            <LawCard
              key={definition.id}
              definition={definition}
              selectedOption={
                definition.options.find(
                  (option) => option.id === choices[definition.id],
                ) ?? null
              }
              onOpen={onOpenLaw}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
