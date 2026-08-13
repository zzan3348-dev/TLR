export type ModifierUnit = "flat" | "percent" | "percentagePoint";

export type Modifier = {
  key: string;
  label?: string;
  value: number;
  unit?: ModifierUnit;
};

export function aggregateModifiers(
  modifierGroups: readonly (readonly Modifier[])[],
): Readonly<Record<string, number>> {
  const totals: Record<string, number> = {};

  for (const group of modifierGroups) {
    for (const modifier of group) {
      totals[modifier.key] = (totals[modifier.key] ?? 0) + modifier.value;
    }
  }

  return totals;
}
