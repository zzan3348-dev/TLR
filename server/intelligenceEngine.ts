import type { IntelligenceConfidence, IntelligencePhase } from "../src/features/intelligence/types.js";

export type IntelligenceBalance = {
  alertnessDecayPer30Days: number; repetitionWindowDays: number;
  repetitionDetection: readonly [number, number, number, number];
};
export const DEFAULT_INTELLIGENCE_BALANCE: IntelligenceBalance = {
  alertnessDecayPer30Days: 3, repetitionWindowDays: 90, repetitionDetection: [0, 5, 10, 15],
};

export function clampIntel(value: number): number { return Math.max(0, Math.min(100, Math.round(value * 10) / 10)); }
export function infiltrationStage(value: number): "NONE" | "CONTACT" | "LIMITED" | "ESTABLISHED" | "DEEP" | "DOMINANT" {
  if (value >= 80) return "DOMINANT"; if (value >= 60) return "DEEP"; if (value >= 40) return "ESTABLISHED";
  if (value >= 20) return "LIMITED"; if (value > 0) return "CONTACT"; return "NONE";
}
export function confidenceForInfiltration(value: number): IntelligenceConfidence {
  if (value >= 80) return "VERY_HIGH"; if (value >= 60) return "HIGH"; if (value >= 40) return "MEDIUM"; if (value >= 20) return "LOW"; return "VERY_LOW";
}
export function estimateRange(actual: number, confidence: IntelligenceConfidence): { minimum: number; maximum: number } {
  const spread = { VERY_LOW: .6, LOW: .4, MEDIUM: .2, HIGH: .1, VERY_HIGH: .05 }[confidence];
  return { minimum: Math.max(0, Math.round(actual * (1 - spread))), maximum: Math.round(actual * (1 + spread)) };
}
export function nextOperationPhase(phase: IntelligencePhase): IntelligencePhase { return phase === "PREPARATION" ? "EXECUTION" : phase === "EXECUTION" ? "EXTRACTION" : "RESULT"; }
export function operationScores(input: { baseDifficulty: number; baseDetectionRisk: number; agency: number; infiltration: number; assetQuality: number; upgrades: number; counterintelligence: number; alertness: number; repetitions: number; cover: number }) {
  const repetition = DEFAULT_INTELLIGENCE_BALANCE.repetitionDetection[Math.min(3, Math.max(0, input.repetitions))];
  return {
    success: clampIntel(50 - input.baseDifficulty * .35 + input.agency * .25 + input.infiltration * .3 + input.assetQuality * .12 + input.upgrades - input.counterintelligence * .25 - input.alertness * .2 - repetition),
    detection: clampIntel(input.baseDetectionRisk + input.counterintelligence * .3 + input.alertness * .25 + repetition - input.cover - input.infiltration * .12),
    attribution: clampIntel(input.counterintelligence * .4 + input.alertness * .15 + repetition - input.cover * .7),
  };
}
export function deterministicRoll(seed: string, channel: string): number {
  let hash = 2166136261;
  for (const char of `${seed}:${channel}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 10000 / 100;
}
export function resolveOperationOutcome(seed: string, scores: { success: number; detection: number; attribution: number }) {
  const detected = deterministicRoll(seed, "detection") < scores.detection;
  const attributionRoll = deterministicRoll(seed, "attribution");
  return {
    success: deterministicRoll(seed, "success") < scores.success ? "SUCCESS" as const : "FAILURE" as const,
    detection: detected ? "DETECTED" as const : "UNDETECTED" as const,
    attribution: !detected ? "UNATTRIBUTED" as const : attributionRoll < scores.attribution * .5 ? "ATTRIBUTED" as const : attributionRoll < scores.attribution ? "SUSPECTED" as const : "UNATTRIBUTED" as const,
  };
}
export function canReserveAsset(status: string, operationIds: readonly string[]): boolean { return status === "ACTIVE" && operationIds.length === 0; }
