import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const inputPath = process.argv[2];
const outputPath = path.join(root, "src", "data", "countryParties.json");
const mapPath = path.join(root, "src", "data", "mapCountries.json");
const taxonomyPath = path.join(
  root,
  "src",
  "data",
  "partyIdeologyTaxonomy.json",
);

if (!inputPath) {
  throw new Error(
    "사용법: npm run import-party-data -- <정당 데이터 TXT 경로>",
  );
}

const [source, mapCountries, taxonomy] = await Promise.all([
  readFile(path.resolve(inputPath), "utf8"),
  readFile(mapPath, "utf8").then(JSON.parse),
  readFile(taxonomyPath, "utf8").then(JSON.parse),
]);

const countryKeyByName = new Map(
  mapCountries.map((country) => [country.name.trim(), country.key]),
);
const output = {};
let country = null;
let party = null;

function fieldValue(line) {
  return line.slice(line.indexOf(":") + 1).trim();
}

function finishParty() {
  if (!country || !party) return;
  country.parties.push(party);
  party = null;
}

function finishCountry() {
  finishParty();
  if (!country) return;

  const countryKey = countryKeyByName.get(country.name);
  if (!countryKey) {
    throw new Error(`지도에서 국가를 찾을 수 없습니다: ${country.name}`);
  }
  if (output[countryKey]) {
    throw new Error(`국가가 중복되었습니다: ${country.name}`);
  }
  if (!taxonomy[country.ideologyCategory]?.includes(country.subIdeology)) {
    throw new Error(
      `${country.name}: 집권 사상 분류가 유효하지 않습니다 (${country.ideologyCategory} / ${country.subIdeology})`,
    );
  }

  const totalSupport = country.parties.reduce(
    (sum, current) => sum + current.support,
    0,
  );
  if (Math.abs(totalSupport - 100) > 0.001) {
    throw new Error(`${country.name}: 정당 지지도 합계가 ${totalSupport}%입니다.`);
  }

  for (const current of country.parties) {
    if (!taxonomy[current.ideologyCategory]?.includes(current.subIdeology)) {
      throw new Error(
        `${country.name} / ${current.name}: 사상 분류가 유효하지 않습니다 (${current.ideologyCategory} / ${current.subIdeology})`,
      );
    }
  }

  output[countryKey] = {
    government: country.government,
    rulingParty: country.rulingParty,
    ideologyCategory: country.ideologyCategory,
    subIdeology: country.subIdeology,
    symbolPath: country.symbolPath,
    parties: country.parties,
  };
  country = null;
}

for (const rawLine of source.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
  const line = rawLine.trim();
  const countryMatch = line.match(/^=\((.+)\)=$/u);
  if (countryMatch) {
    finishCountry();
    country = {
      name: countryMatch[1].trim(),
      government: "",
      rulingParty: "",
      ideologyCategory: "",
      subIdeology: "",
      symbolPath: null,
      parties: [],
    };
    continue;
  }
  if (!country) continue;

  if (/^정당 \d+:$/u.test(line)) {
    finishParty();
    party = {
      id: "",
      name: "",
      ideologyCategory: "",
      subIdeology: "",
      support: 0,
      symbolPath: null,
    };
    continue;
  }

  if (party) {
    if (line.startsWith("정당 ID:")) party.id = fieldValue(line);
    else if (line.startsWith("정당명:")) party.name = fieldValue(line);
    else if (line.startsWith("대분류:")) {
      party.ideologyCategory = fieldValue(line);
    } else if (line.startsWith("하위사상:")) {
      party.subIdeology = fieldValue(line);
    } else if (line.startsWith("지지도(%):")) {
      party.support = Number(fieldValue(line));
    } else if (line.startsWith("표시 색상:")) {
      const color = fieldValue(line);
      if (/^#[0-9a-f]{6}$/iu.test(color)) party.color = color;
    } else if (line.startsWith("아이콘 경로:")) {
      const iconPath = fieldValue(line);
      party.symbolPath = iconPath === "미설정" ? null : iconPath;
    }
    continue;
  }

  if (line.startsWith("정부 형태:")) country.government = fieldValue(line);
  else if (line.startsWith("집권 정당:")) {
    country.rulingParty = fieldValue(line);
  } else if (line.startsWith("집권 대분류:")) {
    country.ideologyCategory = fieldValue(line);
  } else if (line.startsWith("집권 하위사상:")) {
    country.subIdeology = fieldValue(line);
  } else if (line.startsWith("대표 아이콘 경로:")) {
    const iconPath = fieldValue(line);
    country.symbolPath = iconPath === "미설정" ? null : iconPath;
  }
}
finishCountry();

if (Object.keys(output).length !== mapCountries.length) {
  throw new Error(
    `국가 수가 일치하지 않습니다: 입력 ${Object.keys(output).length}, 지도 ${mapCountries.length}`,
  );
}

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `${outputPath} 생성 완료: ${Object.keys(output).length}개 국가, ${Object.values(output).reduce((sum, item) => sum + item.parties.length, 0)}개 정당`,
);
