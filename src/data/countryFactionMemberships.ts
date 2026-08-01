import type { FactionMembership } from "../types/faction";

const member = (factionId: string): FactionMembership => ({
  factionId,
  status: "member",
});

const observer = (factionId: string): FactionMembership => ({
  factionId,
  status: "observer",
});

export const countryFactionMemberships: Readonly<
  Partial<Record<number, FactionMembership>>
> = {
  // 보전협약
  1: member("preservation_accord"),
  56: member("preservation_accord"),

  // 유럽인민연방
  3: member("european_peoples_federation"),
  8: member("european_peoples_federation"),
  11: member("european_peoples_federation"),
  13: member("european_peoples_federation"),
  14: member("european_peoples_federation"),
  16: member("european_peoples_federation"),
  17: member("european_peoples_federation"),
  19: member("european_peoples_federation"),
  21: member("european_peoples_federation"),
  22: member("european_peoples_federation"),
  24: member("european_peoples_federation"),
  25: member("european_peoples_federation"),
  29: member("european_peoples_federation"),
  30: member("european_peoples_federation"),
  26: observer("european_peoples_federation"),

  // 삼국동맹
  34: member("triple_alliance"),
  36: member("triple_alliance"),
  53: member("triple_alliance"),

  // 삼국협상
  39: member("triple_entente"),
  42: member("triple_entente"),
  43: member("triple_entente"),

  // 대양협약: 현재 별도 국가로 존재하는 영국권 국가만 명시한다.
  2: member("oceanic_compact"),
  45: member("oceanic_compact"),
  49: member("oceanic_compact"),
  57: member("oceanic_compact"),
  58: member("oceanic_compact"),
  60: member("oceanic_compact"),
  61: member("oceanic_compact"),
  62: member("oceanic_compact"),

  // 아프리카 자주회의
  44: member("african_sovereignty_congress"),
  47: member("african_sovereignty_congress"),
  48: member("african_sovereignty_congress"),
  50: member("african_sovereignty_congress"),
  55: member("african_sovereignty_congress"),

  // 백색협약
  4: member("white_accord"),
  9: member("white_accord"),
  10: member("white_accord"),
};
