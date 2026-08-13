import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(ROOT, "data", "source");
const GENERATED_POLITICS = path.join(ROOT, "src", "features", "politics", "data", "generated");
const GENERATED_ECONOMY = path.join(ROOT, "src", "features", "economy", "data");

const readUtf8 = (file) => fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const countries = JSON.parse(readUtf8(path.join(ROOT, "src", "data", "mapCountries.json")));
const aliases = new Map([
  ["바이에른 사회주의 공화국", "바이에른사회주의공화국"],
  ["신장 공화국", "신강 공화국"],
  ["쓰촨 공화국", "사천 공화국"],
  ["신도나우 통합제국", "신도나우 연합제국"],
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
        description: note ?? `${meta[1]}의 ${optionMatch[1].trim()} 단계입니다.`, order: optionIndex + 1,
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
console.log(`TLR 시작 데이터 생성 완료: 법률 ${laws.length}개/${laws.reduce((sum, law) => sum + law.options.length, 0)}개 선택지, 사회발전 ${Object.keys(development).length}개국, 자원 ${Object.keys(resources).length}개국`);
