import { useCallback, useEffect, useState } from "react";
import { MilitaryAdminSection, type MilitaryAdminData } from "./MilitaryAdminSection";

export function HeadquartersAdmin() {
  const [data, setData] = useState<MilitaryAdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/military", { credentials: "include" });
      if (!response.ok) throw new Error();
      setData(await response.json() as MilitaryAdminData); setError(null);
    } catch { setError("관리자 군사 정보를 불러오지 못했습니다."); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  return <section><p>관리자 모드 · 변경 사항은 실제 국가에 적용됩니다.</p>{error && <p role="alert">{error}</p>}{data ? <MilitaryAdminSection data={data} onReload={load} onError={setError} /> : <button onClick={() => void load()}>다시 불러오기</button>}</section>;
}
