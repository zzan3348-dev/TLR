import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(ROOT, "data", "source");
const GENERATED_POLITICS = path.join(ROOT, "src", "features", "politics", "data", "generated");
const GENERATED_ECONOMY = path.join(ROOT, "src", "features", "economy", "data");
const GENERATED_PRESENTATION = path.join(ROOT, "src", "data", "generated");

const readUtf8 = (file) => fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const lawDescriptionOverridesPath = path.join(SOURCE_DIR, "law-option-descriptions.json");
const lawDescriptionOverrides = fs.existsSync(lawDescriptionOverridesPath)
  ? JSON.parse(readUtf8(lawDescriptionOverridesPath))
  : {};
const lawDescriptionTemplates = new Map([
  ["party-system", (name) => `${name} 방식으로 정당의 설립과 정치 참여를 구성합니다.`],
  ["religion-policy", (name) => `${name} 원칙에 따라 국가와 종교기관의 관계를 정합니다.`],
  ["trade-unions", (name) => `${name} 체계로 노동조합의 조직과 교섭 권한을 다룹니다.`],
  ["immigration", (name) => `${name} 기준에 따라 외국인의 입국과 정착을 관리합니다.`],
  ["forced-labor", (name) => `${name} 제도에 따라 비자발적 노동의 허용 범위를 정합니다.`],
  ["assembly", (name) => `${name} 기준으로 집회와 사회단체 결성의 자유를 보장하거나 제한합니다.`],
  ["press", (name) => `${name} 체계 아래 언론기관의 설립과 보도 활동이 이루어집니다.`],
  ["franchise", (name) => `${name} 기준으로 대표자를 선출할 수 있는 시민의 범위를 정합니다.`],
  ["service", (name) => `${name} 방식으로 군 복무 인력을 모집하고 동원합니다.`],
  ["training", (name) => `${name} 체계에 맞춰 병력의 교육 기간과 전문화 수준을 정합니다.`],
  ["officers", (name) => `${name} 원칙에 따라 장교를 선발하고 진급시킵니다.`],
  ["exemptions", (name) => `${name} 기준으로 병역 의무의 면제 범위를 정합니다.`],
  ["trade", (name) => `${name} 원칙에 따라 관세와 대외 교역의 개방 범위를 조정합니다.`],
  ["income-tax", (name) => `${name} 체계로 소득에 대한 조세 부담을 배분합니다.`],
  ["minimum-wage", (name) => `${name} 기준에 따라 노동자가 보장받는 최저 보수를 정합니다.`],
  ["working-hours", (name) => `${name} 기준으로 법이 허용하는 노동시간의 범위를 정합니다.`],
  ["unemployment", (name) => `${name} 방식으로 실직자의 생계와 재취업을 지원합니다.`],
  ["pensions", (name) => `${name} 체계로 노후 소득과 부양 책임을 마련합니다.`],
  ["industry-ownership", (name) => `${name} 구조에 따라 산업 자산의 소유권과 경영권을 배분합니다.`],
  ["land-system", (name) => `${name} 체계로 농지의 소유와 경작 권리를 정합니다.`],
  ["healthcare", (name) => `${name} 방식으로 의료비와 의료서비스의 책임을 분담합니다.`],
  ["education", (name) => `${name} 체계에 맞춰 시민이 보장받는 교육의 범위를 정합니다.`],
  ["penal-system", (name) => `${name} 원칙에 따라 범죄에 대한 처벌과 교정 방식을 정합니다.`],
  ["policing", (name) => `${name} 체계로 치안기관의 권한과 지역사회와의 관계를 구성합니다.`],
  ["industry-regulation", (name) => `${name} 방식으로 기업 활동과 생산 현장에 대한 국가 개입을 조정합니다.`],
  ["womens-rights", (name) => `${name} 기준에 따라 여성에게 보장되는 시민적·사회적 권리를 정합니다.`],
  ["ethnic-policy", (name) => `${name} 원칙으로 여러 민족의 법적 지위와 자치 범위를 다룹니다.`],
  ["censorship", (name) => `${name} 기준으로 출판·방송·통신에 대한 국가의 통제 범위를 정합니다.`],
]);

const countries = JSON.parse(readUtf8(path.join(ROOT, "src", "data", "mapCountries.json")));
const aliases = new Map([
  ["바이에른 사회주의 공화국", "바이에른사회주의공화국"],
  ["신장 공화국", "신강 공화국"],
  ["쓰촨 공화국", "사천 공화국"],
  ["신도나우 통합제국", "신도나우 연합제국"],
  ["영국령 인도제국", "영국령 인도"],
]);
const countryByName = new Map(countries.map((country) => [country.name, country]));

function countryKey(sourceName) {
  const normalized = aliases.get(sourceName) ?? sourceName;
  const country = countryByName.get(normalized);
  if (!country) throw new Error(`지도 국가와 일치하지 않는 국명: ${sourceName}`);
  return country.key;
}

function countrySections(text) {
  const headers = [...text.matchAll(/^=\(([^)]+)\)=\s*$/gm)];
  return headers.map((match, index) => ({
    name: match[1].trim(),
    body: text.slice(match.index + match[0].length, headers[index + 1]?.index ?? text.length),
  }));
}

function plainCountrySections(text) {
  const headers = [...text.matchAll(/^=([^=(][^=]+)=\s*$/gm)];
  return headers.map((match, index) => ({
    name: match[1].trim(),
    body: text.slice(match.index + match[0].length, headers[index + 1]?.index ?? text.length),
  }));
}

function requireCountryCount(states, label) {
  if (Object.keys(states).length !== countries.length) {
    throw new Error(`${label} 국가 수 불일치: ${Object.keys(states).length}/${countries.length}`);
  }
}

function importNationalSpirits() {
  const text = readUtf8(path.join(SOURCE_DIR, "TLR_national-spirits_v10.txt"));
  const states = {};
  const adverseEffects = new Set(["빈곤율", "실업률"]);
  for (const section of countrySections(text)) {
    const matches = [...section.body.matchAll(/^국민정신\s+\d+:\s*(.+)$/gm)];
    const spirits = matches.map((match, index) => {
      const body = section.body.slice(match.index + match[0].length, matches[index + 1]?.index ?? section.body.length);
      const description = body.match(/^내용:\s*(.+)$/m)?.[1]?.trim();
      const imagePath = body.match(/^아이콘 경로:\s*(.+)$/m)?.[1]?.trim();
      const effectsBody = body.match(/^효과:\s*\r?\n([\s\S]*?)(?=^아이콘 경로:)/m)?.[1] ?? "";
      const effects = effectsBody.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^-\s+/.test(line)).map((line) => {
        const text = line.replace(/^-\s+/, "");
        const [label, value = ""] = text.split(/:\s*/, 2);
        const number = value.match(/[+-]?\d+(?:\.\d+)?/)?.[0];
        const direction = number?.startsWith("-") ? -1 : 1;
        const harmful = adverseEffects.has(label.trim()) ? direction > 0 : direction < 0;
        return { text, tone: harmful ? "negative" : "positive" };
      });
      if (!description || !imagePath || effects.length === 0) {
        throw new Error(`${section.name}/${match[1].trim()}: 국민정신 필드가 누락되었습니다.`);
      }
      return {
        id: path.basename(imagePath, path.extname(imagePath)),
        name: match[1].trim(), description, imagePath, effects,
      };
    });
    if (spirits.length === 0) throw new Error(`${section.name}: 국민정신이 없습니다.`);
    states[countryKey(section.name)] = spirits;
  }
  requireCountryCount(states, "국민정신");
  writeJson(path.join(GENERATED_PRESENTATION, "countryNationalSpirits.json"), states);
  return states;
}

function field(body, label) {
  return body.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
}

function numeric(value) {
  const match = value?.replaceAll(",", "").match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function moneyBillions(value) {
  const amount = numeric(value);
  if (amount === null) return null;
  const signed = value.trim().startsWith("-") ? -Math.abs(amount) : amount;
  return value.includes("M") ? signed / 1000 : signed;
}

function slashRecord(body, label, keys) {
  const source = field(body, label);
  if (!source) return null;
  const result = {};
  for (const part of source.split("/")) {
    const match = part.trim().match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?)%$/);
    if (!match) continue;
    const key = keys.get(match[1].trim());
    if (key) result[key] = Number(match[2]);
  }
  return Object.keys(result).length === keys.size ? result : null;
}

function importEconomies() {
  const text = readUtf8(path.join(SOURCE_DIR, "TLR_1932_economy-start_v3.txt"));
  const budgetKeys = new Map([["행정", "administration"], ["국방", "defense"], ["산업", "industry"], ["복지", "welfare"], ["교육", "education"]]);
  const industryKeys = new Map([["농림수산", "agriculture"], ["광업·자원", "mining"], ["제조업", "manufacturing"], ["건설·인프라", "construction"], ["상업·운송", "commerce_transport"], ["금융·행정·전문", "finance_services"]]);
  const states = {};
  for (const section of plainCountrySections(text)) {
    const key = countryKey(section.name);
    const currentBudget = slashRecord(section.body, "예산 배분", budgetKeys);
    const industrialStructure = slashRecord(section.body, "산업구조", industryKeys);
    const operatingLines = section.body.match(/정기 운영비:\s*\r?\n((?:\s+.+\r?\n?)+)/m)?.[1] ?? "";
    const operatingCosts = {};
    for (const match of operatingLines.matchAll(/([^/$\r\n]+?)\s+\$([0-9.]+)([MB])/g)) {
      const label = match[1].trim();
      operatingCosts[label] = Number(match[2]) * (match[3] === "M" ? 0.001 : 1);
    }
    if (!currentBudget || !industrialStructure) throw new Error(`${section.name}: 예산 또는 산업구조가 누락되었습니다.`);
    const row = {
      country_key: key,
      gdp: moneyBillions(field(section.body, "GDP")),
      per_capita_gdp: numeric(field(section.body, "1인당 GDP")),
      nominal_growth_rate: numeric(field(section.body, "명목 성장률")),
      real_growth_rate: numeric(field(section.body, "실질 성장률")),
      inflation_rate: numeric(field(section.body, "물가상승률")),
      unemployment_rate: numeric(field(section.body, "실업률")),
      poverty_rate: numeric(field(section.body, "빈곤율")),
      poverty_rate_change: numeric(field(section.body, "빈곤율 변화")),
      total_population: numeric(field(section.body, "총인구")),
      working_age_population: numeric(field(section.body, "생산가능인구")),
      employed_population: numeric(field(section.body, "취업인구")),
      unemployed_population: numeric(field(section.body, "실업인구")),
      urban_population_rate: numeric(field(section.body, "도시인구 비율")),
      rural_population_rate: numeric(field(section.body, "농촌인구 비율")),
      literacy_rate: numeric(field(section.body, "문해율")),
      life_expectancy: numeric(field(section.body, "기대수명")),
      economic_system: field(section.body, "경제체제"),
      economic_bloc: field(section.body, "경제권"),
      credit_rating: field(section.body, "신용등급"),
      bond_interest_rate: numeric(field(section.body, "국채금리")),
      national_debt: moneyBillions(field(section.body, "정부부채")),
      debt_to_gdp_rate: numeric(field(section.body, "GDP 대비 부채")),
      foreign_reserves: moneyBillions(field(section.body, "유동준비금")),
      national_income: moneyBillions(field(section.body, "세입")),
      total_expenditure: moneyBillions(field(section.body, "총지출")),
      fiscal_balance: moneyBillions(field(section.body, "재정수지")),
      nominal_tax_rate: numeric(field(section.body, "명목세율")),
      tax_collection_efficiency: numeric(field(section.body, "징세효율")),
      budget_fulfillment_rate: numeric(field(section.body, "예산충족도")),
      economic_crisis_signal: field(section.body, "경제위기 신호"),
      research_capacity: numeric(field(section.body, "연구역량")),
      base_production_capacity: numeric(field(section.body, "기본 생산능력")),
      production_capacity_modifier: numeric(field(section.body, "생산능력 보정")),
      domestic_capacity_used: numeric(field(section.body, "국내 사용 생산능력")),
      trade_capacity_provided: numeric(field(section.body, "무역 제공 생산능력")),
      trade_capacity_received: numeric(field(section.body, "무역 수령 생산능력")),
      available_production_capacity: numeric(field(section.body, "가용 생산능력")),
      current_budget: currentBudget,
      industrial_structure: industrialStructure,
      operating_costs: operatingCosts,
    };
    if (Object.values(row).some((value) => value === null)) throw new Error(`${section.name}: 경제 필드가 누락되었습니다.`);
    states[key] = row;
  }
  requireCountryCount(states, "경제");
  writeJson(path.join(GENERATED_ECONOMY, "countryEconomyStates.json"), states);
  const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const columns = Object.keys(Object.values(states)[0]).filter((column) => column !== "country_key");
  const sqlValue = (column, value) => ["current_budget", "industrial_structure", "operating_costs"].includes(column) ? json(value) : typeof value === "string" ? quote(value) : value;
  const rows = Object.values(states).map((row) => `  (${quote(row.country_key)},${columns.map((column) => sqlValue(column, row[column])).join(",")},${json(row)})`);
  const migration = `begin;\n\nalter table public.country_economies\n${[
    ["per_capita_gdp", "numeric"], ["real_growth_rate", "numeric"], ["poverty_rate", "numeric"], ["poverty_rate_change", "numeric"],
    ["total_population", "numeric"], ["working_age_population", "numeric"], ["employed_population", "numeric"], ["unemployed_population", "numeric"],
    ["urban_population_rate", "numeric"], ["rural_population_rate", "numeric"], ["literacy_rate", "numeric"], ["life_expectancy", "numeric"],
    ["economic_system", "text"], ["economic_bloc", "text"], ["credit_rating", "text"], ["bond_interest_rate", "numeric"],
    ["debt_to_gdp_rate", "numeric"], ["fiscal_balance", "numeric"], ["economic_crisis_signal", "text"],
    ["trade_capacity_provided", "numeric"], ["trade_capacity_received", "numeric"], ["available_production_capacity", "numeric"],
    ["operating_costs", "jsonb"], ["starting_data", "jsonb"],
  ].map(([name, type]) => `  add column if not exists ${name} ${type}`).join(",\n")};\n\ninsert into public.country_economies (country_key,${columns.join(",")},starting_data) values\n${rows.join(",\n")}\non conflict (country_key) do update set\n${columns.map((column) => `  ${column}=excluded.${column}`).join(",\n")},\n  starting_data=excluded.starting_data,\n  updated_at=now();\n\ncommit;\n`;
  fs.writeFileSync(path.join(ROOT, "supabase", "migrations", "202608250001_country_economy_starting_values.sql"), migration, "utf8");
  return states;
}

function importCountryLawStates() {
  const text = readUtf8(path.join(SOURCE_DIR, "TLR_1932_country-law-start_v2.txt"));
  const states = {};
  for (const section of countrySections(text)) {
    const laws = {};
    for (const match of section.body.matchAll(/^.+\(([^:()]+):([^()]+)\)\s*$/gm)) {
      const lawId = match[1].trim();
      laws[lawId] = `${lawId}:${match[2].trim()}`;
    }
    if (Object.keys(laws).length !== lawMeta.size) throw new Error(`${section.name}: 시작 법률이 ${Object.keys(laws).length}/${lawMeta.size}개입니다.`);
    const key = countryKey(section.name);
    states[key] = { countryId: key, laws };
  }
  requireCountryCount(states, "시작 법률");
  writeJson(path.join(GENERATED_POLITICS, "countryLawStates.json"), states);
  return states;
}

const developmentIds = new Map([
  ["학문적 기반", "academic-foundation"],
  ["연구 시설", "research-facilities"],
  ["농업 방식", "agriculture"],
  ["보건 수준", "health"],
  ["행정 효율", "administration"],
  ["산업 전문성", "industry-specialization"],
  ["공업 장비", "industrial-equipment"],
  ["군 전문성", "military-professionalism"],
]);

function importDevelopment() {
  const text = readUtf8(path.join(SOURCE_DIR, "TLR_1932_development-start_v1.txt"));
  const states = {};
  for (const section of countrySections(text)) {
    const items = [];
    for (const line of section.body.split(/\r?\n/)) {
      const match = line.match(/^([^:]+):\s*([1-5])단계\s*-\s*(.+)$/);
      if (!match) continue;
      const id = developmentIds.get(match[1].trim());
      if (id) items.push({ id, level: Number(match[2]), trend: "stable" });
    }
    if (items.length !== developmentIds.size) {
      throw new Error(`${section.name}: 사회발전 항목이 ${items.length}개입니다.`);
    }
    const key = countryKey(section.name);
    states[key] = { countryId: key, povertyRate: null, povertyChange: null, items };
  }
  if (Object.keys(states).length !== countries.length) {
    throw new Error(`사회발전 국가 수 불일치: ${Object.keys(states).length}/${countries.length}`);
  }
  writeJson(path.join(GENERATED_POLITICS, "countryDevelopmentStates.json"), states);
  return states;
}

const resourceIds = new Map([
  ["철강", "STEEL"],
  ["석유", "OIL"],
  ["석탄", "COAL"],
  ["식량", "FOOD"],
  ["희귀광물", "RARE_MINERALS"],
]);

function numberAfter(body, label) {
  const match = body.match(new RegExp(`^${label}:\\s*([+-]?[0-9]+(?:\\.[0-9]+)?)`, "m"));
  return match ? Number(match[1]) : null;
}

function importResources() {
  const text = readUtf8(path.join(SOURCE_DIR, "TLR_1932_resources-start_v9.txt"));
  const states = {};
  for (const section of countrySections(text)) {
    const resourceHeaders = [...section.body.matchAll(/^\[([^\]]+)\]\s*$/gm)]
      .filter((match) => resourceIds.has(match[1].trim()));
    const rows = resourceHeaders.map((match, index) => {
      const body = section.body.slice(match.index + match[0].length, resourceHeaders[index + 1]?.index ?? section.body.length);
      const production = numberAfter(body, "최종 생산량") ?? numberAfter(body, "생산량") ?? numberAfter(body, "기본 생산량");
      const stockpile = numberAfter(body, "비축량");
      const domesticUse = numberAfter(body, "국내 사용량");
      const exportLimit = numberAfter(body, "수출 한도");
      if ([production, stockpile, domesticUse, exportLimit].some((value) => value === null)) {
        throw new Error(`${section.name}/${match[1]}: 자원 수치가 누락되었습니다.`);
      }
      return {
        country_key: countryKey(section.name),
        resource_type_id: resourceIds.get(match[1].trim()),
        stockpile,
        production_per_period: production,
        domestic_use: domesticUse,
        export_limit: exportLimit,
        is_public: true,
      };
    });
    if (rows.length !== resourceIds.size) throw new Error(`${section.name}: 자원이 ${rows.length}종입니다.`);
    states[countryKey(section.name)] = rows;
  }
  if (Object.keys(states).length !== countries.length) {
    throw new Error(`자원 국가 수 불일치: ${Object.keys(states).length}/${countries.length}`);
  }
  writeJson(path.join(GENERATED_ECONOMY, "countryResourceStates.json"), states);
  const sqlRows = Object.values(states).flat().map((row) =>
    `  ('${row.country_key}','${row.resource_type_id}',${row.stockpile},${row.production_per_period},${row.domestic_use},${row.export_limit},true)`,
  );
  const migration = `begin;\n\ninsert into public.country_resources (\n  country_key,resource_type_id,stockpile,production_per_period,domestic_use,export_limit,is_public\n) values\n${sqlRows.join(",\n")}\non conflict (country_key,resource_type_id) do update set\n  stockpile=excluded.stockpile,\n  production_per_period=excluded.production_per_period,\n  domestic_use=excluded.domestic_use,\n  export_limit=excluded.export_limit,\n  is_public=excluded.is_public,\n  updated_at=now();\n\ncommit;\n`;
  fs.writeFileSync(path.join(ROOT, "supabase", "migrations", "202608130001_country_resource_starting_values.sql"), migration, "utf8");
  return states;
}

const ideologyCategories = [
  "전위사회주의", "평의회사회주의", "생디칼리슴", "자유사회주의", "사회민주주의", "급진공화주의",
  "자유주의", "보수주의", "권위주의", "군주주의", "반동주의", "국가재생주의",
];
const lawMeta = new Map([
  ["party-system", ["political", "정당 제도"]], ["religion-policy", ["political", "종교 정책"]],
  ["trade-unions", ["political", "노동조합"]], ["immigration", ["political", "이민 정책"]],
  ["forced-labor", ["political", "강제노동"]], ["assembly", ["political", "집회·결사의 자유"]],
  ["press", ["political", "언론의 자유"]], ["franchise", ["political", "선거권"]],
  ["service", ["military", "군 복무 제도"]], ["training", ["military", "군사 훈련"]],
  ["officers", ["military", "장교 제도"]], ["exemptions", ["military", "병역 면제"]],
  ["trade", ["economy", "무역법"]], ["income-tax", ["economy", "소득세법"]],
  ["minimum-wage", ["economy", "최저임금법"]], ["working-hours", ["economy", "법정 노동시간"]],
  ["unemployment", ["economy", "실업급여"]], ["pensions", ["economy", "연금"]],
  ["industry-ownership", ["economy", "산업 소유 구조"]], ["land-system", ["economy", "토지 제도"]],
  ["healthcare", ["social", "의료보험"]], ["education", ["social", "교육 정책"]],
  ["penal-system", ["social", "형벌 제도"]], ["policing", ["social", "치안 정책"]],
  ["industry-regulation", ["social", "산업 규제"]], ["womens-rights", ["social", "여성 권리"]],
  ["ethnic-policy", ["social", "민족 정책"]], ["censorship", ["social", "검열"]],
]);

function linesBetween(body, startLabel, stopLabels) {
  const start = body.indexOf(`${startLabel}:`);
  if (start < 0) return [];
  const rest = body.slice(start + startLabel.length + 1);
  let end = rest.length;
  for (const label of stopLabels) {
    const index = rest.indexOf(`\n${label}:`);
    if (index >= 0 && index < end) end = index;
  }
  return rest.slice(0, end).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function compatibility(body, symbol) {
  const match = body.match(new RegExp(`^${symbol}\\s+(.+)$`, "m"));
  if (!match) return [];
  return match[1].split("/").map((value) => value.trim()).filter((value) => ideologyCategories.includes(value));
}

function modifierFromEffect(line) {
  const clean = line.replace(/^[-*]\s*/, "");
  const colon = clean.indexOf(":");
  const label = colon >= 0 ? clean.slice(0, colon).trim() : clean;
  const valueText = colon >= 0 ? clean.slice(colon + 1) : "";
  const number = valueText.match(/[+-]?\d+(?:\.\d+)?/);
  return {
    key: label.replace(/[^가-힣A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "effect",
    label,
    value: number ? Number(number[0]) : 0,
    unit: valueText.includes("%p") ? "percentagePoint" : valueText.includes("%") ? "percent" : "flat",
  };
}

function importLaws() {
  const text = readUtf8(path.join(SOURCE_DIR, "TLR_1932_law-system_v1.txt"));
  const lawMatches = [...text.matchAll(/^law id:\s*([^\s]+)\s*$/gm)];
  const laws = lawMatches.map((lawMatch, lawIndex) => {
    const id = lawMatch[1].trim();
    const meta = lawMeta.get(id);
    if (!meta) throw new Error(`알 수 없는 law id: ${id}`);
    const body = text.slice(lawMatch.index + lawMatch[0].length, lawMatches[lawIndex + 1]?.index ?? text.length);
    const optionMatches = [...body.matchAll(/^\[([^\]]+)\]\s*\r?\noption id:\s*([^\s]+)\s*$/gm)];
    const options = optionMatches.map((optionMatch, optionIndex) => {
      const optionBody = body.slice(optionMatch.index + optionMatch[0].length, optionMatches[optionIndex + 1]?.index ?? body.length);
      const requirements = linesBetween(optionBody, "추가조건", ["상시 관리자 승인", "사상 호환성", "효과", "비고"])
        .map((line, index) => ({ key: `condition-${index + 1}`, label: line.replace(/^[-*]\s*/, "") }))
        .filter((entry) => entry.label !== "없음");
      const allowed = compatibility(optionBody, "○");
      if (allowed.length > 0) requirements.push({ key: "ruling-ideology", label: "허용 집권사상", allowedIdeologyCategories: allowed });
      const effectLines = linesBetween(optionBody, "효과", ["비고"]).map((line) => line.replace(/^[-*]\s*/, ""));
      const note = optionBody.match(/^비고:\s*(.+)$/m)?.[1]?.trim() ?? null;
      const politicalPowerCost = Number(optionBody.match(/^정치력 비용:\s*(\d+)/m)?.[1] ?? 0);
      const requiresAdminApproval = optionBody.match(/^상시 관리자 승인:\s*(.+)$/m)?.[1]?.trim() === "필요";
      return {
        id: optionMatch[2].trim(), name: optionMatch[1].trim(),
        description: lawDescriptionOverrides[optionMatch[2].trim()]
          ?? lawDescriptionTemplates.get(id)?.(optionMatch[1].trim())
          ?? `${optionMatch[1].trim()} 원칙을 적용합니다.`,
        order: optionIndex + 1,
        icon: `${id}/${optionIndex + 1}`, modifiers: effectLines.map(modifierFromEffect), requirements,
        incompatibilities: compatibility(optionBody, "×"), conditionalIdeologyCategories: compatibility(optionBody, "△"),
        politicalPowerCost, requiresAdminApproval, effectLines, notes: note,
      };
    });
    if (options.length !== 5) throw new Error(`${id}: 선택지가 ${options.length}개입니다.`);
    return { id, category: meta[0], name: meta[1], icon: id, description: `${meta[1]}의 운영 기준을 규정합니다.`, options };
  });
  if (laws.length !== lawMeta.size) throw new Error(`법률 수 불일치: ${laws.length}/${lawMeta.size}`);
  writeJson(path.join(GENERATED_POLITICS, "lawDefinitions.json"), laws);
  return laws;
}

const development = importDevelopment();
const resources = importResources();
const laws = importLaws();
const nationalSpirits = importNationalSpirits();
const economies = importEconomies();
const countryLaws = importCountryLawStates();
console.log(`TLR 시작 데이터 생성 완료: 법률 ${laws.length}개/${laws.reduce((sum, law) => sum + law.options.length, 0)}개 선택지, 시작법 ${Object.keys(countryLaws).length}개국, 국민정신 ${Object.keys(nationalSpirits).length}개국, 경제 ${Object.keys(economies).length}개국, 사회발전 ${Object.keys(development).length}개국, 자원 ${Object.keys(resources).length}개국`);
