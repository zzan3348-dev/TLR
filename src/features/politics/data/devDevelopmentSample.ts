import type { CountryDevelopmentState } from "../types/development";

export const DEV_DEVELOPMENT_SAMPLE: CountryDevelopmentState = {
  countryId: "__development_fixture__",
  povertyRate: 28.4,
  povertyChange: -0.14,
  items: [
    { id: "academic-foundation", level: 2, trend: "stable" },
    { id: "research-facilities", level: 3, trend: "down" },
    { id: "agriculture", level: 3, trend: "stable" },
    { id: "health", level: 3, trend: "up" },
    { id: "administration", level: 3, trend: "stable" },
    { id: "industry-specialization", level: 3, trend: "up" },
    { id: "industrial-equipment", level: 4, trend: "stable" },
    { id: "military-professionalism", level: 3, trend: "up" },
  ],
};
