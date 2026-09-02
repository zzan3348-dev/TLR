import { useEffect, useState } from "react";

type SiteState = {
  status: "pre_open" | "open";
  openedAt: string | null;
  openedBy: string | null;
};

export function SiteStatusAdminSection() {
  const [site, setSite] = useState<SiteState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/site-status", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("SITE_STATUS_FAILED");
        setSite(await response.json() as SiteState);
      })
      .catch(() => setError("개장 상태를 불러오지 못했습니다."));
  }, []);

  const openSite = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/site-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "OPEN" }),
      });
      if (!response.ok) throw new Error("SITE_OPEN_FAILED");
      setSite(await response.json() as SiteState);
      setConfirming(false);
    } catch {
      setError("개장 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="directorate-diplomacy directorate-site-status" aria-labelledby="directorate-site-status-title">
      <header>
        <div><span>SITE OPENING CONTROL</span><h2 id="directorate-site-status-title">개장 상태</h2></div>
        <strong>{site?.status === "open" ? "개장" : site ? "개장 전" : "확인 중"}</strong>
      </header>
      <div className="directorate-site-status__body">
        <p>현재 상태: <b>{site?.status === "open" ? "OPEN" : "PRE_OPEN"}</b></p>
        {site?.status === "open" ? (
          <p>개장 시각 {site.openedAt ? new Date(site.openedAt).toLocaleString("ko-KR") : "—"} · 처리자 {site.openedBy ?? "—"}</p>
        ) : (
          <button type="button" disabled={!site || busy} onClick={() => setConfirming(true)}>개장하기</button>
        )}
        {error ? <p className="directorate-diplomacy__error" role="alert">{error}</p> : null}
      </div>
      {confirming ? (
        <div className="directorate-site-status__modal-layer" role="presentation">
          <section className="directorate-site-status__modal" role="alertdialog" aria-modal="true" aria-labelledby="site-open-confirm-title">
            <h3 id="site-open-confirm-title">TLR을 개장하시겠습니까?</h3>
            <p>개장 후 일반 플레이어가 플레이 화면에 접근할 수 있게 됩니다.</p>
            <div>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)}>취소</button>
              <button type="button" disabled={busy} onClick={() => void openSite()}>{busy ? "처리 중…" : "개장하기"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
