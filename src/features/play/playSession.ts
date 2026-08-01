const PLAY_COUNTRY_STORAGE_KEY = "tlr-play-country";
const PLAY_LAWS_STORAGE_PREFIX = "tlr-play-laws:";

export function readPlayCountryKey(): string | null {
  try {
    return sessionStorage.getItem(PLAY_COUNTRY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storePlayCountryKey(countryKey: string): void {
  try {
    sessionStorage.setItem(PLAY_COUNTRY_STORAGE_KEY, countryKey);
  } catch {
    // 저장소가 차단된 환경에서도 현재 React 상태로 플레이를 유지한다.
  }
}

export function clearPlayCountryKey(): void {
  try {
    sessionStorage.removeItem(PLAY_COUNTRY_STORAGE_KEY);
  } catch {
    // 저장소가 차단된 환경에서도 플레이 모드 종료는 계속한다.
  }
}

export function readSessionLawChoices(
  countryKey: string,
): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(
      `${PLAY_LAWS_STORAGE_PREFIX}${countryKey}`,
    );
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function storeSessionLawChoices(
  countryKey: string,
  choices: Readonly<Record<string, string>>,
): void {
  try {
    sessionStorage.setItem(
      `${PLAY_LAWS_STORAGE_PREFIX}${countryKey}`,
      JSON.stringify(choices),
    );
  } catch {
    // 저장소가 차단된 환경에서도 현재 React 상태로 변경을 유지한다.
  }
}
