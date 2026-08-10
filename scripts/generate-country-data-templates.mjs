/* global process */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "docs", "country-data-input");
const countries = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "mapCountries.json"), "utf8"),
).sort((a, b) => a.id - b.id);
const presentations = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "countryPresentation.json"), "utf8"),
);

const unset = (value) => {
  if (value === null || value === undefined || value === "") return "미설정";
  return String(value);
};

const countryHeader = (country) => `=(${country.name})=`;
const joinCountries = (render) =>
  `${countries.map((country) => render(country, presentations[country.key] ?? {})).join("\n\n")}\n`;

fs.mkdirSync(outputDir, { recursive: true });

const partyText = joinCountries((country, presentation) => {
  const politics = presentation.politics ?? {};
  const parties = Array.isArray(politics.parties) ? politics.parties : [];
  const partyRows = parties.length
    ? parties
        .map(
          (party, index) =>
            `정당 ${index + 1}:\n정당 ID: ${unset(party.id)}\n정당명: ${unset(party.name)}\n정당 사상: ${unset(party.ideology)}\n지지도(%): ${unset(party.support)}\n표시 색상: ${unset(party.color)}\n아이콘 경로: ${unset(party.symbolPath)}`,
        )
        .join("\n\n")
    : "정당 1:\n정당 ID: 미설정\n정당명: 미설정\n정당 사상: 미설정\n지지도(%): 미설정\n표시 색상: 미설정\n아이콘 경로: 미설정";
  return `${countryHeader(country)}\n정부 형태: ${unset(politics.government)}\n집권 정당: ${unset(politics.rulingParty)}\n집권 사상: ${unset(politics.ideology)}\n대표 아이콘 경로: ${unset(politics.symbolPath)}\n정당 지지도 합계(%): 미설정\n\n${partyRows}`;
});

const spiritText = joinCountries((country, presentation) => {
  const spirits = Array.isArray(presentation.nationalSpirits)
    ? presentation.nationalSpirits
    : [];
  if (!spirits.length) {
    return `${countryHeader(country)}\n국민정신 1: 미설정\n내용: 미설정\n효과:\n- 미설정\n아이콘 경로: 미설정`;
  }
  const rows = spirits.map((spirit, index) => {
    const effects = Array.isArray(spirit.effects) && spirit.effects.length
      ? spirit.effects.map((effect) => `- [${unset(effect.tone)}] ${unset(effect.text)}`).join("\n")
      : "- 미설정";
    return `국민정신 ${index + 1}: ${unset(spirit.name)}\n내용: ${unset(spirit.description)}\n효과:\n${effects}\n아이콘 경로: ${unset(spirit.imagePath)}`;
  });
  return `${countryHeader(country)}\n${rows.join("\n\n")}`;
});

const economyText = joinCountries((country) => `${countryHeader(country)}
GDP: 미설정
1인당 GDP: 미설정
명목 성장률(%): 미설정
실질 성장률(%): 미설정
물가 상승률(%): 미설정
실업률(%): 미설정
빈곤율(%): 미설정
빈곤율 변화(%p): 미설정
총인구: 미설정
생산가능인구: 미설정
국민소득: 미설정
정부 부채: 미설정
GDP 대비 부채(%): 미설정
외환보유액: 미설정
세입: 미설정
총지출: 미설정
명목 세율(%): 미설정
징세 효율(%): 미설정
연구 역량: 미설정
예산 이행률(%): 미설정
기본 생산능력: 미설정
생산능력 보정치(%): 미설정
국내 사용 생산능력: 미설정
무역 제공 생산능력: 미설정
무역 수령 생산능력: 미설정
가용 생산능력: 미설정

예산 비율(합계 100%):
행정(%): 미설정
국방(%): 미설정
산업(%): 미설정
복지(%): 미설정
교육(%): 미설정

정기 운영비:
행정기관 운영비: 미설정
군 유지비: 미설정
사회보장비: 미설정
교육·연구비: 미설정
부채 이자비: 미설정
해외영토·점령지 유지비: 미설정
첩보기관 운영비: 미설정
기타 고정비: 미설정`);

const lawFields = [
  ["정치법", "정당 제도", "party-system"],
  ["정치법", "종교 정책", "religion-policy"],
  ["정치법", "노동조합", "trade-unions"],
  ["정치법", "이민 정책", "immigration"],
  ["정치법", "강제노동", "forced-labor"],
  ["정치법", "집회·결사의 자유", "assembly"],
  ["정치법", "언론의 자유", "press"],
  ["정치법", "선거권", "franchise"],
  ["군사법", "군 복무 제도", "service"],
  ["군사법", "군사 훈련", "training"],
  ["군사법", "장교 제도", "officers"],
  ["군사법", "병역 면제", "exemptions"],
  ["경제법", "무역법", "trade"],
  ["경제법", "소득세법", "income-tax"],
  ["경제법", "최저임금법", "minimum-wage"],
  ["경제법", "법정 노동시간", "working-hours"],
  ["경제법", "실업급여", "unemployment"],
  ["경제법", "연금", "pensions"],
  ["경제법", "산업 소유 구조", "industry-ownership"],
  ["경제법", "토지 제도", "land-system"],
  ["사회법", "의료보험", "healthcare"],
  ["사회법", "교육 정책", "education"],
  ["사회법", "형벌 제도", "penal-system"],
  ["사회법", "치안 정책", "policing"],
  ["사회법", "산업 규제", "industry-regulation"],
  ["사회법", "여성 권리", "womens-rights"],
  ["사회법", "민족 정책", "ethnic-policy"],
  ["사회법", "검열", "censorship"],
];
const developmentFields = [
  ["학문적 기반", "academic-foundation"],
  ["연구 시설", "research-facilities"],
  ["농업 방식", "agriculture"],
  ["보건 수준", "health"],
  ["행정 효율", "administration"],
  ["산업 전문성", "industry-specialization"],
  ["공업 장비", "industrial-equipment"],
  ["군 전문성", "military-professionalism"],
];
const lawText = joinCountries((country) => {
  let lastCategory = "";
  const laws = lawFields.map(([category, label, id]) => {
    const heading = category !== lastCategory ? `\n[${category}]\n` : "";
    lastCategory = category;
    return `${heading}${label} (${id}): 미설정\n요구조건: 미설정\n효과: 미설정\n변경 비용(정치력): 미설정\n변경 소요기간(일): 미설정`;
  }).join("\n\n");
  const development = developmentFields.map(([label, id]) =>
    `${label} (${id}): 미설정\n단계 효과: 미설정\n다음 단계 요구조건: 미설정\n향상 비용: 미설정\n향상 소요기간(일): 미설정`,
  ).join("\n\n");
  return `${countryHeader(country)}\n${laws}\n\n[사회발전]\n${development}`;
});

const statsText = joinCountries((country) => `${countryHeader(country)}
정치력: 미설정
일일 정치력 변화: 미설정
안정도(%): 미설정
전쟁 지지도(%): 미설정
가용 인력: 미설정
동원 가능 인구(%): 미설정
국민 통합도(%): 미설정
정부 정통성(%): 미설정
외교 영향력: 미설정
이념 영향력: 미설정
연구 슬롯: 미설정
연구 속도 보정(%): 미설정
공장 생산량 보정(%): 미설정
조선소 생산량 보정(%): 미설정
건설 속도 보정(%): 미설정
소비재 비율(%): 미설정
군수 생산 효율(%): 미설정
군 조직력 보정(%): 미설정
육군 경험치: 미설정
해군 경험치: 미설정
공군 경험치: 미설정
핵심영토 방어 보정(%): 미설정
점령지 저항도(%): 미설정
국가 행동 포인트: 미설정
행동 포인트 회복량: 미설정
턴/정산 주기: 미설정
기타 국가 보정치: 미설정`);

const tradeText = joinCountries((country) => `${countryHeader(country)}
자동 무역 조정: 미설정
정산 주기(일): 미설정
총 수입액: 미설정
총 수출액: 미설정
무역수지: 미설정
수입 생산능력: 미설정
수출 생산능력: 미설정
무역 가능 생산능력: 미설정

[철강]
보유량: 미설정
기간당 생산량: 미설정
국내 소비량: 미설정
수출 상한: 미설정
공개 여부: 미설정

[석유]
보유량: 미설정
기간당 생산량: 미설정
국내 소비량: 미설정
수출 상한: 미설정
공개 여부: 미설정

[석탄]
보유량: 미설정
기간당 생산량: 미설정
국내 소비량: 미설정
수출 상한: 미설정
공개 여부: 미설정

[식량]
보유량: 미설정
기간당 생산량: 미설정
국내 소비량: 미설정
수출 상한: 미설정
공개 여부: 미설정

[희귀광물]
보유량: 미설정
기간당 생산량: 미설정
국내 소비량: 미설정
수출 상한: 미설정
공개 여부: 미설정

[무역 상대국 1]
상대국: 미설정
관계 상태: 미설정
수입 품목·수량: 미설정
수출 품목·수량: 미설정
거래 시작일: 미설정
거래 종료일: 미설정
중도 해지 허용: 미설정
위반 시 비용·제재: 미설정`);

const intelligenceText = joinCountries((country) => `${countryHeader(country)}
정보기관 명칭: 미설정
기관 규모: 미설정
기관 예산: 미설정
요원 수: 미설정
신규 요원 충원 비용: 미설정
작전 슬롯: 미설정
방첩 강도: 미설정
암호화 수준: 미설정
복호화 수준: 미설정
정치 정보 수집력: 미설정
경제 정보 수집력: 미설정
군사 정보 수집력: 미설정
산업 정보 수집력: 미설정
해외 공작 능력: 미설정
국내 보안 능력: 미설정
작전 성공률 보정(%): 미설정
작전 발각률 보정(%): 미설정
정보망 유지비: 미설정
작전 기본 비용: 미설정
요원 훈련 비용: 미설정

[해외 정보망 1]
대상 국가: 미설정
침투 강도: 미설정
네트워크 규모: 미설정
정보 신뢰도(%): 미설정
월간 유지비: 미설정
활성 작전: 미설정`);

const commonCosts = `TLR 공통 비용·운영값 입력표
============================

이 파일은 국가별 파일에서 빠뜨리기 쉬운 공통 비용과 처리 주기를 정리한다.
확정되지 않은 값은 임의 수치로 만들지 않고 미설정으로 유지한다.

[세계 운영]
세계 시간 1턴의 길이: 미설정
경제 정산 주기(일): 미설정
무역 정산 주기(일): 미설정
정치력 기본 회복량: 미설정
국가 행동 포인트 기본 회복량: 미설정

[법률·정책]
법률 단계 변경 기본 정치력 비용: 미설정
법률 단계 변경 기본 소요기간(일): 미설정
사회발전 단계 향상 기본 비용: 미설정
사회발전 단계 향상 기본 소요기간(일): 미설정
정책 철회 비용: 미설정

[경제·무역]
무역 제안 비용: 미설정
무역 협정 유지비: 미설정
무역 협정 조기 해지 비용: 미설정
협정 위반 배상 기준: 미설정
부족 자원 긴급수입 할증률(%): 미설정
부채 기본 이자율(%): 미설정

[외교]
외교 전문 발송 비용: 미설정
관계 개선 비용: 미설정
교역 제안 비용: 미설정
조약 검토 비용: 미설정
첩보망 구축 비용: 미설정

[첩보]
정보기관 창설 비용: 미설정
요원 1명 충원 비용: 미설정
정보망 단계별 유지비: 미설정
작전 유형별 기본 비용: 미설정
작전 준비기간(일): 미설정

[군사]
부대 창설 비용: 미설정
부대 월간 유지비: 미설정
장비 보충 비용: 미설정
동원 비용: 미설정
전쟁 선포 비용: 미설정
점령지 월간 유지비: 미설정
분쟁 행동 포인트 비용: 미설정

[관리자 검토]
비용 단위(정치력/예산/생산능력/행동 포인트): 미설정
최솟값·최댓값: 미설정
관리자 승인 필요 기준: 미설정
실패 시 환불률(%): 미설정
취소 시 환불률(%): 미설정
`;

const outputs = {
  "01_모든국가_정당정보.txt": partyText,
  "02_모든국가_국민정신.txt": spiritText,
  "03_모든국가_경제정보.txt": economyText,
  "04_모든국가_법률과_사회발전.txt": lawText,
  "05_모든국가_기본스탯.txt": statsText,
  "06_모든국가_무역과_자원.txt": tradeText,
  "07_모든국가_첩보강도.txt": intelligenceText,
  "08_공통_비용과_운영값.txt": commonCosts,
};

for (const [fileName, content] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(outputDir, fileName), content, "utf8");
}

console.log(`${countries.length}개 국가 기준 TXT ${Object.keys(outputs).length}개 생성 완료`);
