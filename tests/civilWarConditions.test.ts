import { describe, expect, it } from "vitest";
import { evaluateAutomaticCivilWar } from "../server/civilWarConditions";

describe("evaluateAutomaticCivilWar", () => {
  it("선거국은 안정도 20 이하이면서 적대 스펙트럼이 집권 스펙트럼을 앞설 때만 발동한다", () => {
    expect(evaluateAutomaticCivilWar({ holdsElections: true, stability: 20, rulingSpectrumId: "democratic", spectrumSupport: [{ spectrumId: "democratic", support: 38 }, { spectrumId: "revolutionary", support: 41 }] }).triggered).toBe(true);
    expect(evaluateAutomaticCivilWar({ holdsElections: true, stability: 21, rulingSpectrumId: "democratic", spectrumSupport: [{ spectrumId: "democratic", support: 38 }, { spectrumId: "revolutionary", support: 41 }] }).reason).toBe("STABILITY_TOO_HIGH");
  });

  it("비선거국은 다른 스펙트럼이 45 이상이고 집권 스펙트럼보다 높아야 한다", () => {
    expect(evaluateAutomaticCivilWar({ holdsElections: false, stability: 80, rulingSpectrumId: "authority", spectrumSupport: [{ spectrumId: "authority", support: 30 }, { spectrumId: "socialist", support: 45 }] }).triggered).toBe(true);
    expect(evaluateAutomaticCivilWar({ holdsElections: false, stability: 10, rulingSpectrumId: "authority", spectrumSupport: [{ spectrumId: "authority", support: 30 }, { spectrumId: "socialist", support: 44.9 }] }).reason).toBe("HOSTILE_SUPPORT_BELOW_45");
  });

  it("같은 스펙트럼 내부 정당 차이는 내전 조건으로 보지 않는다", () => {
    expect(evaluateAutomaticCivilWar({ holdsElections: false, stability: 10, rulingSpectrumId: "socialist", spectrumSupport: [{ spectrumId: "socialist", support: 70 }] }).triggered).toBe(false);
  });
});
