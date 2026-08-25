import type { CountryLawState } from "../types/laws";
import generatedStates from "./generated/countryLawStates.json";

export const countryLawStates = generatedStates as Readonly<Record<string, CountryLawState>>;
