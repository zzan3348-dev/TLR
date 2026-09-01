import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : "C:/Users/kimji/Downloads/TLR_국가기본수치_전쟁지지도60_가용인력1차설정.txt";
const outputPath = path.join(root, "src/features/play/data/countryBaseStats.json");
const migrationPath = path.join(
  root,
  "supabase/migrations/202608290001_country_base_stats.sql",
);
const countries = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/mapCountries.json"), "utf8"),
);

const normalizeName = (value) => value.replace(/\s+/g, "").trim();
const numberField = (body, label) => {
  const match = body.match(new RegExp(`^${label}:\\s*([+\\d,.-]+)`, "m"));
  if (!match) throw new Error(`${label} 값이 없습니다.`);
  const parsed = Number(match[1].replace(/[+,]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`${label} 값이 숫자가 아닙니다: ${match[1]}`);
  return parsed;
};

const source = fs.readFileSync(sourcePath, "utf8");
const sections = [...source.matchAll(/^=\((.+?)\)=\r?\n([\s\S]*?)(?=^=\(|(?![\s\S]))/gm)].map(
  ([, name, body]) => ({ name: name.trim(), normalizedName: normalizeName(name), body }),
);
if (sections.length !== 62 || countries.length !== 62) {
  throw new Error(`62개국이 필요합니다. TXT=${sections.length}, 지도=${countries.length}`);
}

const result = Object.fromEntries(
  countries.map((country) => {
    const section = sections.find(
      (candidate) => candidate.normalizedName === normalizeName(country.name),
    );
    if (!section) throw new Error(`${country.key} ${country.name}의 기본수치를 찾지 못했습니다.`);
    const row = {
      country_key: country.key,
      country_name: country.name,
      base_political_power: numberField(section.body, "정치력"),
      political_power_per_turn: numberField(section.body, "일일 정치력 변화"),
      base_stability: numberField(section.body, "안정도\\(%\\)"),
      base_war_support: numberField(section.body, "전쟁 지지도\\(%\\)"),
      base_available_manpower: numberField(section.body, "가용 인력"),
    };
    if (
      row.base_political_power !== 300 ||
      row.political_power_per_turn !== 200 ||
      row.base_stability !== 100 ||
      row.base_war_support !== 60 ||
      row.base_available_manpower <= 0
    ) {
      throw new Error(`${country.key} ${country.name}의 확정 기본수치가 유효하지 않습니다.`);
    }
    return [country.key, row];
  }),
);

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
const values = Object.values(result)
  .map(
    (row) =>
      `  ('${row.country_key}',${row.base_political_power},${row.political_power_per_turn},${row.base_stability},${row.base_war_support},${row.base_available_manpower})`,
  )
  .join(",\n");
const migration = `begin;

alter table public.country_decision_states
  add column if not exists base_political_power numeric,
  add column if not exists political_power_per_turn numeric,
  add column if not exists base_stability numeric,
  add column if not exists base_war_support numeric,
  add column if not exists last_political_power_turn integer;

alter table public.country_military_resources
  add column if not exists base_available_manpower integer
    check (base_available_manpower is null or base_available_manpower >= 0);

create temporary table tlr_country_base_stats (
  country_key text primary key,
  base_political_power numeric not null,
  political_power_per_turn numeric not null,
  base_stability numeric not null,
  base_war_support numeric not null,
  base_available_manpower integer not null
) on commit drop;

insert into tlr_country_base_stats values
${values};

insert into public.country_decision_states (
  country_key,
  political_power,
  political_power_gain_modifier,
  stability,
  war_support,
  base_political_power,
  political_power_per_turn,
  base_stability,
  base_war_support
)
select
  country_key,
  base_political_power,
  0,
  base_stability,
  base_war_support,
  base_political_power,
  political_power_per_turn,
  base_stability,
  base_war_support
from tlr_country_base_stats
on conflict (country_key) do update set
  political_power = coalesce(country_decision_states.political_power, excluded.base_political_power),
  stability = coalesce(country_decision_states.stability, excluded.base_stability),
  war_support = coalesce(country_decision_states.war_support, excluded.base_war_support),
  base_political_power = excluded.base_political_power,
  political_power_per_turn = excluded.political_power_per_turn,
  base_stability = excluded.base_stability,
  base_war_support = excluded.base_war_support,
  updated_at = now();

insert into public.country_military_resources (
  country_key,
  available_manpower,
  base_available_manpower
)
select country_key, base_available_manpower, base_available_manpower
from tlr_country_base_stats
on conflict (country_key) do update set
  available_manpower = coalesce(country_military_resources.available_manpower, excluded.base_available_manpower),
  base_available_manpower = excluded.base_available_manpower,
  updated_at = now();

update public.country_decision_states
set last_political_power_turn = 1
where last_political_power_turn is null;

commit;
`;
fs.writeFileSync(migrationPath, migration, "utf8");
console.log(`62개국 기본수치를 생성했습니다: ${path.relative(root, outputPath)}`);
console.log(`DB 시드 마이그레이션을 생성했습니다: ${path.relative(root, migrationPath)}`);
