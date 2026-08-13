import generatedDefinitions from "./generated/lawDefinitions.json";
import type { LawDefinition } from "../types/laws";

/**
 * `npm run import-starting-data`가 운영 기준 TXT에서 생성한다.
 * 화면과 판정 로직은 이 고정 결과만 읽으므로 브라우저 재시작과 무관하게 순서가 유지된다.
 */
export const lawDefinitions = generatedDefinitions as readonly LawDefinition[];

export const lawDefinitionById = new Map(
  lawDefinitions.map((definition) => [definition.id, definition]),
);
