import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input) throw new Error("사용법: node scripts/import-diplomacy-start.mjs <초기외교관계.txt>");

const countries = JSON.parse(fs.readFileSync(path.join(root, "src/data/mapCountries.json"), "utf8"));
const aliases = new Map([
  ["영국령 인도제국", "영국령 인도"],
]);
const countryByName = new Map();
for (const country of countries) {
  for (const name of [country.name, country.shortName, country.mapLabel, country.internalName]) {
    if (typeof name === "string" && name.trim()) countryByName.set(name.trim(), country);
  }
}

function countryKey(name) {
  const normalized = aliases.get(name.trim()) ?? name.trim();
  const country = countryByName.get(normalized);
  if (!country) throw new Error(`지도 국가와 일치하지 않는 국명: ${name}`);
  return country.key;
}

const source = fs.readFileSync(path.resolve(input), "utf8").replace(/^\uFEFF/u, "");
const pattern = /^(.+?) ↔ (.+?)\r?\n관계도:\s*([+-]?\d+)\r?\n유형:\s*(.+)\r?\n근거:\s*(.+)$/gmu;
const relations = [...source.matchAll(pattern)].map((match) => ({
  countryAKey: countryKey(match[1]),
  countryBKey: countryKey(match[2]),
  countryAName: match[1].trim(),
  countryBName: match[2].trim(),
  score: Number(match[3]),
  type: match[4].trim(),
  reason: match[5].trim(),
}));
if (relations.length !== 45) throw new Error(`초기 외교관계 45쌍이 필요하지만 ${relations.length}쌍을 찾았습니다.`);

const directionalRows = relations.flatMap((relation) => [
  [relation.countryAKey, relation.countryBKey, relation.score],
  [relation.countryBKey, relation.countryAKey, relation.score],
]);
const sqlValues = directionalRows.map(([sourceKey, targetKey, score]) =>
  `  ('${sourceKey}','${targetKey}',${score})`,
).join(",\n");
const migration = `begin;\n\ninsert into public.country_relations (source_country_key,target_country_key,base_score) values\n${sqlValues}\non conflict (source_country_key,target_country_key) do update set\n  base_score=excluded.base_score,\n  updated_at=now();\n\ncommit;\n`;

fs.mkdirSync(path.join(root, "data/source"), { recursive: true });
fs.mkdirSync(path.join(root, "src/data/generated"), { recursive: true });
fs.copyFileSync(path.resolve(input), path.join(root, "data/source/TLR_1932_diplomacy-relations_v1.txt"));
fs.writeFileSync(path.join(root, "src/data/generated/initialDiplomaticRelations.json"), `${JSON.stringify(relations, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(root, "supabase/migrations/202608260001_initial_diplomatic_relations.sql"), migration, "utf8");
console.log(`초기 외교관계 ${relations.length}쌍 / 방향 데이터 ${directionalRows.length}개 생성 완료`);
