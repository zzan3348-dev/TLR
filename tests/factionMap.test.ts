import { describe, expect, it } from "vitest";
import { countryFactionMemberships } from "../src/data/countryFactionMemberships";
import { factions, NON_ALIGNED_COLOR } from "../src/data/factions";
import { mapCountries } from "../src/data/mapCountries";
import { mapCountryLabels } from "../src/data/mapCountryLabels";
import {
  createFactionMapLabels,
  getFactionMembershipLabel,
  resolveFactionMapColor,
} from "../src/utils/factionMapUtils";

describe("faction map data", () => {
  it("유럽인민연방 정회원과 옵저버를 확정 목록 그대로 유지한다", () => {
    const factionId = "european_peoples_federation";
    const members = mapCountries
      .filter(
        (country) =>
          country.factionMembership?.factionId === factionId &&
          country.factionMembership.status === "member",
      )
      .map((country) => country.name)
      .sort();
    const observers = mapCountries
      .filter(
        (country) =>
          country.factionMembership?.factionId === factionId &&
          country.factionMembership.status === "observer",
      )
      .map((country) => country.name);

    expect(members).toEqual(
      [
        "이베리아 사회주의 공화국",
        "프랑스 인민공화국",
        "바이에른사회주의공화국",
        "보헤미아 인민공화국",
        "헝가리 인민공화국",
        "독일민주공화국",
        "우크라이나 농민연방공화국",
        "폴란드 사회민주공화국",
        "아라곤 자유지대",
        "이탈리아 인민공화국",
        "오스트리아 인민공화국",
        "유고슬라비아 인민연방공화국",
        "루마니아 사회주의 공화국",
        "러시아 인민공화국",
      ].sort(),
    );
    expect(observers).toEqual(["캅카스 인민연방공화국"]);
  });

  it("옵저버 소속은 보존하되 세력지도에는 표시하지 않는다", () => {
    const caucasus = mapCountries.find((country) => country.id === 26);

    expect(caucasus).toBeDefined();
    expect(caucasus?.factionMembership?.status).toBe("observer");
    expect(resolveFactionMapColor(caucasus)).toBe(NON_ALIGNED_COLOR);
    expect(getFactionMembershipLabel(caucasus!)).toBe("비동맹");
  });

  it("보전협약은 확정된 두 국가만 정회원으로 둔다", () => {
    const factionId = "preservation_accord";
    const faction = factions.find((entry) => entry.id === factionId);
    const members = mapCountries
      .filter(
        (country) =>
          country.factionMembership?.factionId === factionId &&
          country.factionMembership.status === "member",
      )
      .map((country) => country.name)
      .sort();

    expect(factions).toHaveLength(7);
    expect(faction).toMatchObject({
      name: "보전협약",
      englishName: "Preservation Accord",
      color: "#9A5436",
    });
    expect(members).toEqual(
      ["컬럼비아 개척연방", "아르헨티나 공화국"].sort(),
    );
    expect(
      Object.values(countryFactionMemberships).filter(
        (membership) => membership?.factionId === factionId,
      ),
    ).toHaveLength(2);

    for (const countryId of [1, 56]) {
      const country = mapCountries.find((entry) => entry.id === countryId);
      expect(country?.factionMembership?.status).toBe("member");
      expect(resolveFactionMapColor(country)).toBe(faction?.color);
      expect(getFactionMembershipLabel(country!)).toBe("보전협약");
    }
  });

  it("미가입 국가와 잘못된 세력 참조는 비동맹으로 처리한다", () => {
    const nonAligned = mapCountries.find((country) => country.id === 7);
    expect(resolveFactionMapColor(nonAligned)).toBe(NON_ALIGNED_COLOR);
    expect(getFactionMembershipLabel(nonAligned!)).toBe("비동맹");
    expect(countryFactionMemberships[7]).toBeUndefined();
  });

  it("세력명은 지정된 영역별 횟수와 위치에 맞게 표시한다", () => {
    const labels = createFactionMapLabels(
      mapCountryLabels,
      mapCountries,
      5616,
    );
    const count = (text: string) =>
      labels.filter((label) => label.text === text).length;
    const europeanLabels = labels.filter(
      (label) => label.text === "유럽인민연방",
    );

    expect(count("백색협약")).toBe(1);
    expect(europeanLabels).toHaveLength(2);
    expect(europeanLabels.every((label) => label.countryId !== 14)).toBe(true);
    expect(count("아프리카 자주회의")).toBe(3);
    expect(count("보전협약")).toBe(2);
  });
});
