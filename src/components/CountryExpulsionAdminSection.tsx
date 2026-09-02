import { useCallback, useEffect, useState } from "react";
import { mapCountries } from "../data/mapCountries";

type Assignment = {
  countryKey: string;
  userId: string;
  discordUserId: string | null;
  discordUsername: string | null;
  assignedAt: string;
};

function countryName(countryKey: string): string {
  return mapCountries.find((country) => country.key === countryKey)?.name ?? countryKey;
}

export function CountryExpulsionAdminSection() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchAssignments = useCallback(async (): Promise<Assignment[]> => {
    const response = await fetch("/api/admin/country-applications", { credentials: "include" });
    if (!response.ok) throw new Error("ASSIGNMENT_LIST_FAILED");
    const payload = await response.json() as { assignments?: Assignment[] };
    return payload.assignments ?? [];
  }, []);

  useEffect(() => {
    void fetchAssignments()
      .then(setAssignments)
      .catch(() => setError("현재 국가 배정 목록을 불러오지 못했습니다."));
  }, [fetchAssignments]);

  const expel = async (assignment: Assignment) => {
    const key = `${assignment.userId}:${assignment.countryKey}`;
    const reason = reasons[key]?.trim() ?? "";
    if (!reason) {
      setError("추방 사유를 입력해 주세요.");
      return;
    }
    const username = assignment.discordUsername || assignment.discordUserId || "해당 사용자";
    if (!window.confirm(`${username}님의 ${countryName(assignment.countryKey)} 연재 자격을 박탈하시겠습니까?`)) return;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EXPEL_COUNTRY_USER",
          targetUserId: assignment.userId,
          targetCountryKey: assignment.countryKey,
          reason,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "COUNTRY_EXPULSION_FAILED");
      setNotice(`${username}님의 ${countryName(assignment.countryKey)} 연재 자격을 박탈하고 Discord에 공지했습니다.`);
      setReasons((current) => ({ ...current, [key]: "" }));
      setAssignments(await fetchAssignments());
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "COUNTRY_EXPULSION_FAILED";
      setError(code === "COUNTRY_EXPELLED_NOTIFICATION_FAILED"
        ? "국가 배정은 회수됐지만 Discord 공지 전송에 실패했습니다. 봇 토큰과 채널 권한을 확인해 주세요."
        : "추방 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      await fetchAssignments().then(setAssignments).catch(() => undefined);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="directorate-diplomacy directorate-expulsion" aria-labelledby="directorate-expulsion-title">
      <header>
        <div><span>PLAYER ASSIGNMENT / REVOCATION</span><h2 id="directorate-expulsion-title">국가 연재 자격 추방</h2></div>
        <strong>활성 배정 {assignments.length}건</strong>
      </header>
      {notice ? <p className="directorate-expulsion__notice" role="status">{notice}</p> : null}
      {error ? <p className="directorate-diplomacy__error" role="alert">{error}</p> : null}
      {assignments.length === 0 && !error ? <p className="directorate-diplomacy__empty">현재 활성 국가 배정이 없습니다.</p> : null}
      <div className="directorate-diplomacy__queue">
        {assignments.map((assignment) => {
          const key = `${assignment.userId}:${assignment.countryKey}`;
          return (
            <article key={key}>
              <div>
                <small>{assignment.discordUserId ? `DISCORD ${assignment.discordUserId}` : "DISCORD 정보 없음"}</small>
                <h3>{assignment.discordUsername || "이름 미확인"} · {countryName(assignment.countryKey)}</h3>
                <p>배정 시각 {new Date(assignment.assignedAt).toLocaleString("ko-KR")}</p>
              </div>
              <div className="directorate-expulsion__form">
                <label htmlFor={`expulsion-reason-${key}`}>추방 사유</label>
                <textarea
                  id={`expulsion-reason-${key}`}
                  maxLength={500}
                  placeholder="Discord 공지에 표시할 사유"
                  value={reasons[key] ?? ""}
                  onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))}
                />
                <button type="button" disabled={busyKey !== null || !(reasons[key]?.trim())} onClick={() => void expel(assignment)}>
                  {busyKey === key ? "추방 처리 중…" : "추방"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
