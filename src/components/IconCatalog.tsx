import { UiIcon } from "./UiIcon";

const GROUPS = {
  HUD: ["hud/political-power", "hud/stability", "hud/war-support", "hud/manpower", "hud/production", "hud/gdp", "hud/national-debt"],
  법률: ["law/party-system", "law/religion-policy", "law/trade-unions", "law/immigration", "law/forced-labor", "law/assembly", "law/press", "law/franchise", "law/service", "law/training", "law/officers", "law/exemptions", "law/trade", "law/income-tax", "law/minimum-wage", "law/working-hours", "law/unemployment", "law/pensions", "law/healthcare", "law/education", "law/penal-system", "law/policing", "law/industry-regulation", "law/womens-rights"],
  외교: ["diplomacy/message", "diplomacy/relations", "diplomacy/trade", "diplomacy/treaty", "diplomacy/intel"],
  첩보: ["intelligence/agency", "intelligence/defense", "intelligence/operation", "intelligence/training", "intelligence/cipher"],
  디시전: ["decision/objective", "decision/available", "decision/locked", "decision/cost", "decision/complete"],
  "Generated law pictograms": [
    "/assets/ui/generated-icons/laws/party-system.png", "/assets/ui/generated-icons/laws/religion-policy.png", "/assets/ui/generated-icons/laws/trade-unions.png", "/assets/ui/generated-icons/laws/immigration.png", "/assets/ui/generated-icons/laws/forced-labor.png", "/assets/ui/generated-icons/laws/assembly.png",
    "/assets/ui/generated-icons/laws/press.png", "/assets/ui/generated-icons/laws/franchise.png", "/assets/ui/generated-icons/laws/service.png", "/assets/ui/generated-icons/laws/officers.png", "/assets/ui/generated-icons/laws/training.png", "/assets/ui/generated-icons/laws/exemptions.png",
    "/assets/ui/generated-icons/laws/trade.png", "/assets/ui/generated-icons/laws/income-tax.png", "/assets/ui/generated-icons/laws/minimum-wage.png", "/assets/ui/generated-icons/laws/working-hours.png", "/assets/ui/generated-icons/laws/unemployment.png", "/assets/ui/generated-icons/laws/pensions.png",
    "/assets/ui/generated-icons/laws/healthcare.png", "/assets/ui/generated-icons/laws/education.png", "/assets/ui/generated-icons/laws/penal-system.png", "/assets/ui/generated-icons/laws/policing.png", "/assets/ui/generated-icons/laws/industry-regulation.png", "/assets/ui/generated-icons/laws/womens-rights.png",
    "/assets/ui/generated-icons/laws/permit-system.png", "/assets/ui/generated-icons/laws/registration-system.png", "/assets/ui/generated-icons/laws/assembly-open.png", "/assets/ui/generated-icons/laws/censorship.png", "/assets/ui/generated-icons/laws/open-borders.png", "/assets/ui/generated-icons/laws/closed-borders.png",
  ],
} as const;

export function IconCatalog() {
  return (
    <main className="icon-catalog">
      <header><h1>TLR 픽토그램 카탈로그</h1><p>정적 이미지 에셋 · normal / hover / disabled 상태는 UI가 적용합니다.</p></header>
      {Object.entries(GROUPS).map(([title, icons]) => (
        <section key={title} className="icon-catalog__group">
          <h2>{title}</h2>
          <div className="icon-catalog__grid">
            {icons.map((name) => (
              <figure key={name}><span><UiIcon name={name} /></span><figcaption>{name}</figcaption></figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
