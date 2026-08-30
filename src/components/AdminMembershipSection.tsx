import { useState } from "react";

export function AdminMembershipSection() {
  const [username, setUsername] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const register = async () => {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/admin/actions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REGISTER_DISCORD_ADMIN", targetDiscordUsername: username.trim(), reason: "TLR 사이트 관리자 등록" }) });
    const payload = await response.json().catch(() => ({})) as { error?: string; discordUsername?: string };
    setMessage(response.ok ? `${payload.discordUsername ?? username} 계정을 관리자로 등록했습니다.` : payload.error === "PROFILE_NOT_FOUND" ? "해당 Discord 로그인 프로필을 찾지 못했습니다." : "관리자 등록에 실패했습니다."); setBusy(false);
  };
  return <section className="directorate-diplomacy directorate-membership" aria-labelledby="directorate-membership-title"><header><div><span>DISCORD ADMIN REGISTRY</span><h2 id="directorate-membership-title">Discord 관리자 등록</h2></div></header><div className="directorate-preview__body"><label>Discord 사용자명<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="guitar_hero0405" /></label><button type="button" disabled={busy || !username.trim()} onClick={() => void register()}>{busy ? "등록 중…" : "관리자 등록"}</button>{message ? <p role="status">{message}</p> : null}</div></section>;
}
