import { describe, expect, it } from "vitest";
import { mapCountries } from "../src/data/mapCountries";
import {
  buildEulSeatMap,
  EUL_PARLIAMENT_MEMBERS,
  isEulFullMember,
} from "../src/features/decisions/data/eulParliament";

describe("EUL 연방의회 데이터", () => {
  it("정회원 14개국이 정확히 300석을 구성한다", () => {
    expect(EUL_PARLIAMENT_MEMBERS).toHaveLength(14);
    expect(EUL_PARLIAMENT_MEMBERS.reduce((sum, member) => sum + member.seats, 0)).toBe(300);
    expect(buildEulSeatMap()).toHaveLength(300);
  });

  it("독일민주공화국은 44석이고 모든 의석 ID가 안정적으로 연속된다", () => {
    const germany = EUL_PARLIAMENT_MEMBERS.find((member) => member.country.id === 8);
    const seats = buildEulSeatMap();

    expect(germany?.seats).toBe(44);
    expect(seats.filter((seat) => seat.countryId === 8)).toHaveLength(44);
    expect(seats.map((seat) => seat.index)).toEqual(Array.from({ length: 300 }, (_, index) => index));
  });

  it("옵저버는 의회에서 제외하고 정회원에게만 전용 화면을 허용한다", () => {
    const fullMember = mapCountries.find((country) => country.id === 8);
    const observer = mapCountries.find((country) => country.id === 26);

    expect(fullMember && isEulFullMember(fullMember)).toBe(true);
    expect(observer && isEulFullMember(observer)).toBe(false);
    expect(EUL_PARLIAMENT_MEMBERS.some((member) => member.country.id === 26)).toBe(false);
  });
});
