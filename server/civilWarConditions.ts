export type SpectrumSupport = { spectrumId: string; support: number };

export type CivilWarConditionInput = {
  holdsElections: boolean;
  stability: number | null;
  rulingSpectrumId: string | null;
  spectrumSupport: SpectrumSupport[];
};

export type CivilWarConditionResult = {
  triggered: boolean;
  hostileSpectrumId: string | null;
  hostileSupport: number | null;
  reason: "TRIGGERED" | "MISSING_DATA" | "STABILITY_TOO_HIGH" | "RULING_SPECTRUM_LEADS" | "HOSTILE_SUPPORT_BELOW_45";
};

export function evaluateAutomaticCivilWar(input: CivilWarConditionInput): CivilWarConditionResult {
  if (input.stability === null || !input.rulingSpectrumId) return { triggered: false, hostileSpectrumId: null, hostileSupport: null, reason: "MISSING_DATA" };
  const rulingSupport = input.spectrumSupport.find((row) => row.spectrumId === input.rulingSpectrumId)?.support;
  if (rulingSupport === undefined) return { triggered: false, hostileSpectrumId: null, hostileSupport: null, reason: "MISSING_DATA" };
  const hostile = input.spectrumSupport
    .filter((row) => row.spectrumId !== input.rulingSpectrumId)
    .reduce<SpectrumSupport | null>((highest, row) => !highest || row.support > highest.support ? row : highest, null);
  if (!hostile) return { triggered: false, hostileSpectrumId: null, hostileSupport: null, reason: "RULING_SPECTRUM_LEADS" };
  if (input.holdsElections) {
    if (input.stability > 20) return { triggered: false, hostileSpectrumId: hostile.spectrumId, hostileSupport: hostile.support, reason: "STABILITY_TOO_HIGH" };
    const triggered = hostile.support > rulingSupport;
    return { triggered, hostileSpectrumId: hostile.spectrumId, hostileSupport: hostile.support, reason: triggered ? "TRIGGERED" : "RULING_SPECTRUM_LEADS" };
  }
  const triggered = hostile.support >= 45 && hostile.support > rulingSupport;
  return { triggered, hostileSpectrumId: hostile.spectrumId, hostileSupport: hostile.support, reason: triggered ? "TRIGGERED" : hostile.support < 45 ? "HOSTILE_SUPPORT_BELOW_45" : "RULING_SPECTRUM_LEADS" };
}
