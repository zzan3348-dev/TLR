import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseStats = JSON.parse(
  fs.readFileSync(path.join(root, "src/features/play/data/countryBaseStats.json"), "utf8"),
);
const economies = JSON.parse(
  fs.readFileSync(path.join(root, "src/features/economy/data/countryEconomyStates.json"), "utf8"),
);
const reportPath = path.join(root, "reports/country-hud-data-audit-2026-08-29.md");

const fields = [
  ["시작 정치력", (key) => baseStats[key]?.base_political_power],
  ["턴당 정치력", (key) => baseStats[key]?.political_power_per_turn],
  ["기본 안정도", (key) => baseStats[key]?.base_stability],
  ["기본 전쟁 지지도", (key) => baseStats[key]?.base_war_support],
  ["기본 가용 인력", (key) => baseStats[key]?.base_available_manpower],
  ["연구역량", (key) => economies[key]?.research_capacity],
  ["무역 제공량", (key) => economies[key]?.trade_capacity_provided],
  ["국채금리", (key) => economies[key]?.bond_interest_rate],
  ["신용등급", (key) => economies[key]?.credit_rating],
];
const invalid = (value) =>
  value === null ||
  value === undefined ||
  value === "" ||
  value === "N/A" ||
  value === "미설정";
const keys = Object.keys(baseStats).sort();
if (keys.length !== 62) throw new Error(`기본수치 국가 수가 62가 아닙니다: ${keys.length}`);

const missing = [];
const sourceZeros = [];
for (const key of keys) {
  for (const [label, read] of fields) {
    const value = read(key);
    if (invalid(value)) missing.push({ key, name: baseStats[key].country_name, label, value });
    else if (value === 0) sourceZeros.push({ key, name: baseStats[key].country_name, label });
  }
}

const lines = [
  "# TLR 62개국 상단 HUD 데이터 감사",
  "",
  `- 검사 국가: ${keys.length}개국`,
  `- 검사 필드: ${fields.length}개`,
  `- null / undefined / N/A / 미설정: ${missing.length}건`,
  `- 원본 데이터가 실제 0인 값: ${sourceZeros.length}건`,
  "",
  "## 누락 또는 fallback 값",
  "",
  ...(missing.length
    ? missing.map((row) => `- ${row.key} ${row.name}: ${row.label} = ${String(row.value)}`)
    : ["- 없음"]),
  "",
  "## 원본에서 0으로 확정된 값",
  "",
  ...(sourceZeros.length
    ? sourceZeros.map((row) => `- ${row.key} ${row.name}: ${row.label} = 0`)
    : ["- 없음"]),
  "",
];
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(lines.slice(1, 6).join("\n"));
if (missing.length) process.exitCode = 1;
