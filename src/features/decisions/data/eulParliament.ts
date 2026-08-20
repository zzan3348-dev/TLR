import { mapCountries } from "../../../data/mapCountries";
import type { MapCountryIndex } from "../../../types/mapCountry";

export type EulVoteStance = "YES" | "NO" | "ABSTAIN" | "UNDECIDED";
export type EulParliamentView = "NORMAL" | "COUNTRY_INSPECT" | "VOTE";

export type EulParliamentMember = {
  country: MapCountryIndex;
  seats: number;
  influence: number;
  rank: number;
  stance: EulVoteStance;
};

export type EulAgenda = {
  id: string;
  title: string;
  proposerCountryId: number;
  kind: string;
  threshold: number;
  turnsRemaining: number;
  phase: "DELIBERATION" | "CONFIRMED" | "CANCELLED";
};

export type EulDecisionAction = {
  id: string;
  countryId?: number;
  title: string;
  description: string;
  cost: number;
  icon: string;
  minimumInfluence?: number;
  requiresAgenda?: boolean;
  requiresOwnAgenda?: boolean;
  requiresUndecidedTarget?: boolean;
  lockedReason?: string;
};

const member = (
  countryId: number,
  seats: number,
  influence: number,
  rank: number,
  stance: EulVoteStance,
): EulParliamentMember => {
  const country = mapCountries.find((candidate) => candidate.id === countryId);
  if (!country) throw new Error(`EUL 회원국 데이터 누락: ${countryId}`);
  return { country, seats, influence, rank, stance };
};

export const EUL_PARLIAMENT_MEMBERS: readonly EulParliamentMember[] = [
  member(13, 52, 88, 1, "YES"),
  member(3, 52, 86, 2, "NO"),
  member(8, 44, 72, 3, "YES"),
  member(24, 18, 58, 4, "YES"),
  member(11, 18, 54, 5, "YES"),
  member(14, 18, 50, 6, "NO"),
  member(25, 15, 48, 7, "UNDECIDED"),
  member(29, 14, 47, 8, "UNDECIDED"),
  member(21, 13, 45, 9, "YES"),
  member(19, 15, 43, 10, "ABSTAIN"),
  member(22, 13, 41, 11, "NO"),
  member(16, 12, 39, 12, "YES"),
  member(17, 8, 38, 13, "ABSTAIN"),
  member(30, 8, 24, 14, "UNDECIDED"),
];

export const EUL_DEFAULT_AGENDA: EulAgenda = {
  id: "comradely-intervention-ban",
  title: "동지적 개입 금지 결의",
  proposerCountryId: 8,
  kind: "일반결의",
  threshold: 151,
  turnsRemaining: 2,
  phase: "DELIBERATION",
};

export const EUL_COMMON_ACTIONS: readonly EulDecisionAction[] = [
  { id: "delegate-contact", title: "대표단 접촉", description: "미정 회원국에 정치적 제안을 보냅니다.", cost: 50, icon: "/assets/ui/generated-icons/research/request.png", requiresAgenda: true, requiresUndecidedTarget: true },
  { id: "delay-vote", title: "표결 연기 요구", description: "현재 안건의 심의기간을 1턴 연장합니다.", cost: 60, icon: "/assets/ui/generated-icons/laws/assembly.png", minimumInfluence: 40, requiresAgenda: true },
  { id: "early-vote", title: "조기표결 요구", description: "통과선이 확보된 자국 안건을 즉시 확정합니다.", cost: 75, icon: "/assets/ui/generated-icons/laws/franchise.png", requiresOwnAgenda: true },
  { id: "withdraw-agenda", title: "안건 철회", description: "표결 확정 전 자국 안건을 철회합니다.", cost: 0, icon: "/assets/ui/generated-icons/laws/censorship.png", requiresOwnAgenda: true },
];

export const EUL_COUNTRY_ACTIONS: readonly EulDecisionAction[] = [
  { id: "fr-executive", countryId: 13, title: "연방 집행권 강화 요구", description: "연방 집행권 확대안 표결을 시작합니다. 통과선 200표.", cost: 150, icon: "/assets/ui/generated-icons/laws/party-system.png", minimumInfluence: 75 },
  { id: "fr-elders", countryId: 13, title: "혁명 원로회의 소집", description: "늙은 혁명 국민정신을 완화할 후속 이벤트를 엽니다.", cost: 100, icon: "/assets/ui/generated-icons/laws/assembly.png", lockedReason: "'늙은 혁명' 국민정신 필요" },
  { id: "ru-east", countryId: 3, title: "동방혁명 필요성 선전", description: "동방혁명 지원 표결을 시작합니다. 통과선 180표.", cost: 150, icon: "/assets/ui/generated-icons/research/request.png", minimumInfluence: 70 },
  { id: "ru-ural", countryId: 3, title: "우랄 방면위원회 설치", description: "동방정책의 행정 전초기지를 정비합니다.", cost: 100, icon: "/assets/ui/generated-icons/laws/service.png" },
  { id: "de-intervention", countryId: 8, title: "동지적 개입 종식 요구", description: "회원국 간 동지적 개입 금지 결의를 제안합니다.", cost: 125, icon: "/assets/ui/generated-icons/laws/assembly-open.png", minimumInfluence: 60 },
  { id: "by-small-state", countryId: 17, title: "소국 대표권 보장 요구", description: "총 300석을 유지하며 소국 의석 배분을 재조정합니다.", cost: 150, icon: "/assets/ui/generated-icons/laws/franchise.png", minimumInfluence: 40 },
  { id: "bo-slovakia", countryId: 16, title: "슬로바키아 중재 요청", description: "슬로바키아 문제에 대한 연방 중재를 요청합니다.", cost: 125, icon: "/assets/ui/generated-icons/research/request.png" },
  { id: "bo-recovery", countryId: 16, title: "연방 복구위원회 구성", description: "전후 복구를 위한 연방 위원회를 구성합니다.", cost: 125, icon: "/assets/ui/generated-icons/laws/assembly.png", lockedReason: "관련 국민정신 필요" },
  { id: "hu-slovakia", countryId: 19, title: "슬로바키아 행정위원회 요구", description: "공동 행정위원회 구성을 요구합니다.", cost: 100, icon: "/assets/ui/generated-icons/laws/registration-system.png" },
  { id: "it-libya", countryId: 24, title: "리비아 연방화 제안", description: "리비아 연방화 안건을 제출합니다.", cost: 125, icon: "/assets/ui/generated-icons/laws/open-borders.png", minimumInfluence: 50 },
  { id: "it-south", countryId: 24, title: "남부 개발위원회 구성", description: "남부 개발을 위한 연방 지원을 요청합니다.", cost: 125, icon: "/assets/ui/generated-icons/laws/industry-regulation.png", lockedReason: "관련 국민정신 필요" },
  { id: "au-danube", countryId: 21, title: "신도나우 위협 공동대응 요구", description: "신도나우 문제를 연방 안건으로 상정합니다.", cost: 125, icon: "/assets/ui/generated-icons/laws/service.png", minimumInfluence: 40 },
  { id: "yu-balkan", countryId: 25, title: "발칸 개발기금 요구", description: "발칸 개발을 위한 예산안 표결을 시작합니다.", cost: 125, icon: "/assets/ui/generated-icons/research/investment.png", minimumInfluence: 50 },
  { id: "ro-carpathia", countryId: 22, title: "카르파티아 청원 제출", description: "카르파티아 지역 현안을 연방에 청원합니다.", cost: 100, icon: "/assets/ui/generated-icons/research/request.png" },
  { id: "ib-north", countryId: 29, title: "북부 문제 중재 요구", description: "이베리아 북부 문제의 연방 중재를 요구합니다.", cost: 125, icon: "/assets/ui/generated-icons/laws/assembly-open.png", minimumInfluence: 45 },
];

export type EulSeat = { index: number; countryId: number };

export function buildEulSeatMap(
  members: readonly EulParliamentMember[] = EUL_PARLIAMENT_MEMBERS,
): EulSeat[] {
  const seats = members.flatMap((entry) =>
    Array.from({ length: entry.seats }, (_, offset) => ({
      index: offset,
      countryId: entry.country.id,
    })),
  );
  return seats.map((seat, index) => ({ ...seat, index }));
}

export function isEulFullMember(country: MapCountryIndex): boolean {
  return country.factionMembership?.factionId === "european_peoples_federation" && country.factionMembership.status === "member";
}

