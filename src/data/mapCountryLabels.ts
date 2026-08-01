import labelData from "./mapCountryLabels.json";
import type {
  MapCountryLabel,
  MapLabelLayoutMode,
} from "../types/mapCountry";

const isLayoutMode = (value: string): value is MapLabelLayoutMode =>
  value === "straight" || value === "arc-up" || value === "arc-down";

export const mapCountryLabels: readonly MapCountryLabel[] = labelData.map(
  (label): MapCountryLabel => ({
    ...label,
    ownershipFitRatio:
      "ownershipFitRatio" in label &&
      typeof label.ownershipFitRatio === "number"
        ? label.ownershipFitRatio
        : label.fitRatio,
    layoutMode: isLayoutMode(label.layoutMode)
      ? label.layoutMode
      : "straight",
    pathType: "quadratic",
    mode:
      label.mode === "manual" || label.mode === "hidden"
        ? label.mode
        : "auto",
  }),
);
