import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectRoot, "public", "maps", "world-1932.png");
const generatedDirectory = path.join(
  projectRoot,
  "public",
  "maps",
  "generated",
);
const dataDirectory = path.join(projectRoot, "src", "data");
const backupDirectory = path.join(projectRoot, "public", "maps", "backups");
const reportPath = path.join(
  generatedDirectory,
  "map-update-report.json",
);
const generatedDataFiles = [
  "mapCountries.json",
  "mapCountryComponents.json",
  "mapCountryPhysicalComponents.json",
  "mapCountryDisplayGroups.json",
  "mapCountryLabels.json",
];

function readArguments() {
  const inputIndex = process.argv.indexOf("--input");
  if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
    throw new Error(
      '사용법: npm run update-map-source -- --input "<새 지도 PNG 경로>" [--dry-run]',
    );
  }
  return {
    inputPath: path.resolve(process.cwd(), process.argv[inputIndex + 1]),
    dryRun: process.argv.includes("--dry-run"),
  };
}

function comparePngs(previous, next) {
  let changedPixels = 0;
  for (let index = 0; index < previous.data.length; index += 4) {
    if (
      previous.data[index] !== next.data[index] ||
      previous.data[index + 1] !== next.data[index + 1] ||
      previous.data[index + 2] !== next.data[index + 2] ||
      previous.data[index + 3] !== next.data[index + 3]
    ) {
      changedPixels += 1;
    }
  }
  return changedPixels;
}

function runMapGeneration(inputPath, stageGenerated, stageData) {
  return spawnSync(
    process.execPath,
    [path.join(scriptDirectory, "generate-map-assets.mjs")],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "inherit",
      env: {
        ...process.env,
        MAP_SOURCE_PATH: inputPath,
        MAP_GENERATION_OUTPUT_DIRECTORY: stageGenerated,
        MAP_DATA_OUTPUT_DIRECTORY: stageData,
      },
    },
  );
}

function runProductionBuild() {
  const packageManager =
    process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return spawnSync(packageManager, ["run", "build"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function restoreSnapshot(snapshotDirectory) {
  await copyFile(path.join(snapshotDirectory, "world-1932.png"), sourcePath);
  await rm(generatedDirectory, { recursive: true, force: true });
  await cp(
    path.join(snapshotDirectory, "generated"),
    generatedDirectory,
    { recursive: true },
  );
  for (const fileName of generatedDataFiles) {
    await copyFile(
      path.join(snapshotDirectory, "data", fileName),
      path.join(dataDirectory, fileName),
    );
  }
}

async function main() {
  const { inputPath, dryRun } = readArguments();
  const [previousBuffer, nextBuffer] = await Promise.all([
    readFile(sourcePath),
    readFile(inputPath),
  ]);
  const previous = PNG.sync.read(previousBuffer);
  const next = PNG.sync.read(nextBuffer);
  if (previous.width !== next.width || previous.height !== next.height) {
    throw new Error(
      `지도 크기가 다릅니다: 기존 ${previous.width}×${previous.height}, 새 지도 ${next.width}×${next.height}`,
    );
  }

  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "world-map-update-"),
  );
  const stageGenerated = path.join(temporaryRoot, "generated");
  const stageData = path.join(temporaryRoot, "data");
  await Promise.all([
    mkdir(stageGenerated, { recursive: true }),
    mkdir(stageData, { recursive: true }),
  ]);

  try {
    const generationResult = runMapGeneration(
      inputPath,
      stageGenerated,
      stageData,
    );
    if (generationResult.status !== 0) {
      throw new Error("임시 디렉터리에서 지도 에셋 생성에 실패했습니다.");
    }
    const generationReport = JSON.parse(
      await readFile(
        path.join(stageGenerated, "map-generation-report.json"),
        "utf8",
      ),
    );
    if (
      generationReport.unresolvedDarkLinePixelCount !== 0 ||
      generationReport.internalProvinceLinePixelsInCountryLayer !== 0
    ) {
      throw new Error(
        "clean ownership 또는 국가 국경 검증이 실패해 새 지도를 적용하지 않았습니다.",
      );
    }
    const updateSummary = {
      input: inputPath,
      dryRun,
      width: next.width,
      height: next.height,
      changedPixels: comparePngs(previous, next),
      representativeColorCount: generationReport.representativeColorCount,
      unresolvedDarkLinePixelCount:
        generationReport.unresolvedDarkLinePixelCount,
      physicalComponentCount: generationReport.rawComponentCount,
      displayGroupCount: generationReport.componentAndMaskCount,
      protectedCountries: generationReport.protectedCountries,
    };
    if (dryRun) {
      console.log("검사 전용 실행 완료: 정식 파일은 변경하지 않았습니다.");
      console.log(JSON.stringify(updateSummary, null, 2));
      return;
    }

    const snapshotDirectory = path.join(temporaryRoot, "rollback");
    await mkdir(path.join(snapshotDirectory, "data"), { recursive: true });
    await copyFile(
      sourcePath,
      path.join(snapshotDirectory, "world-1932.png"),
    );
    await cp(
      generatedDirectory,
      path.join(snapshotDirectory, "generated"),
      { recursive: true },
    );
    for (const fileName of generatedDataFiles) {
      await copyFile(
        path.join(dataDirectory, fileName),
        path.join(snapshotDirectory, "data", fileName),
      );
    }

    await mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = path.join(
      backupDirectory,
      `world-1932-${timestamp}.png`,
    );
    await copyFile(sourcePath, backupPath);

    try {
      await copyFile(inputPath, sourcePath);
      await rm(generatedDirectory, { recursive: true, force: true });
      await cp(stageGenerated, generatedDirectory, { recursive: true });
      for (const fileName of generatedDataFiles) {
        await copyFile(
          path.join(stageData, fileName),
          path.join(dataDirectory, fileName),
        );
      }
      const buildResult = runProductionBuild();
      if (buildResult.status !== 0) {
        throw new Error("프로덕션 빌드 검증에 실패했습니다.");
      }
      await writeFile(
        reportPath,
        `${JSON.stringify(
          {
            ...updateSummary,
            backup: path
              .relative(projectRoot, backupPath)
              .replaceAll("\\", "/"),
            updatedAt: new Date().toISOString(),
            preservedData: [
              "country id/key",
              "internalName/name/nativeName/shortName/mapLabel/shortLabel/allowShortMapLabel",
              "flag settings",
              "manual label/label group",
              "manual display grouping",
              "protected country settings",
              "color migrations",
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } catch (error) {
      await restoreSnapshot(snapshotDirectory);
      throw new Error(
        `새 지도 적용을 원상복구했습니다: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

await main();
