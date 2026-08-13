import type { CountryDevelopmentState } from "../types/development";
import generatedStates from "./generated/countryDevelopmentStates.json";

export const countryDevelopmentStates: Readonly<
  Record<string, CountryDevelopmentState>
> = generatedStates as Readonly<Record<string, CountryDevelopmentState>>;
