import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CountryFlag } from "../../../components/CountryFlag";
import { mapCountries } from "../../../data/mapCountries";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { withParticle } from "../../../utils/koreanParticle";
import {
  announceEconomyUpdate,
  loadTradeNotifications,
  respondTradeProposal,
  updateTradeNotification,
} from "../../economy/economyClient";
import { RESOURCE_LABELS, type TradeNotification } from "../../economy/types";
import {
  announceDiplomacyUpdate,
  loadDiplomacyNotifications,
  respondToProposal,
  updateDiplomacyNotification,
} from "../diplomacyClient";
import { PROPOSAL_LABELS, type DiplomacyNotification } from "../types";

type Props = { country: MapCountryIndex };
const POLL_INTERVAL_MS = 30_000;

function countryByKey(key: string): MapCountryIndex | null {
  return mapCountries.find((country) => country.key === key) ?? null;
}

export function DiplomacyNotificationQueue({ country }: Props) {
  const [diplomacy, setDiplomacy] = useState<DiplomacyNotification[]>([]);
  const [trade, setTrade] = useState<TradeNotification[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [diplomacyResult, tradeResult] = await Promise.all([
        loadDiplomacyNotifications(country.key, signal),
        loadTradeNotifications(country.key, signal),
      ]);
      setDiplomacy(diplomacyResult.notifications.filter((item) =>
        item.notification_type === "PROPOSAL_RECEIVED" && item.proposal?.status === "PENDING" && item.proposal.review_route === "PLAYER",
      ));
      setTrade(tradeResult.notifications.filter((item) =>
        item.notification_type === "PROPOSAL_RECEIVED" && item.proposal?.status === "PENDING" && item.proposal.review_route === "PLAYER",
      ));
      setError(null);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("외교·무역 요청을 불러오지 못했습니다.");
    }
  }, [country.key]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_INTERVAL_MS);
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const refreshNow = () => void refresh();
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("tlr:diplomacy-updated", refreshNow);
    window.addEventListener("tlr:economy-updated", refreshNow);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("tlr:diplomacy-updated", refreshNow);
      window.removeEventListener("tlr:economy-updated", refreshNow);
    };
  }, [refresh]);

  const currentDiplomacy = useMemo(() => diplomacy.find((item) => !hiddenIds.has(item.id)) ?? null, [diplomacy, hiddenIds]);
  const currentTrade = useMemo(() => currentDiplomacy ? null : trade.find((item) => !hiddenIds.has(item.id)) ?? null, [currentDiplomacy, hiddenIds, trade]);

  useEffect(() => {
    if (!currentDiplomacy || currentDiplomacy.read_at) return;
    void updateDiplomacyNotification(country.key, currentDiplomacy.id, "READ").then(() => {
      setDiplomacy((items) => items.map((item) => item.id === currentDiplomacy.id ? { ...item, read_at: new Date().toISOString() } : item));
    });
  }, [country.key, currentDiplomacy]);

  useEffect(() => {
    if (!currentTrade || currentTrade.read_at) return;
    void updateTradeNotification(country.key, currentTrade.id, "READ").then(() => {
      setTrade((items) => items.map((item) => item.id === currentTrade.id ? { ...item, read_at: new Date().toISOString() } : item));
    });
  }, [country.key, currentTrade]);

  useEffect(() => {
    const active = currentDiplomacy ?? currentTrade;
    if (!active) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHiddenIds((ids) => new Set(ids).add(active.id));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentDiplomacy, currentTrade]);

  const respondDiplomacy = async (action: "ACCEPT" | "REJECT") => {
    if (!currentDiplomacy?.proposal) return;
    setBusy(true); setError(null);
    try {
      await respondToProposal(country.key, currentDiplomacy.proposal.id, action);
      await updateDiplomacyNotification(country.key, currentDiplomacy.id, "DISMISS");
      setDiplomacy((items) => items.filter((item) => item.id !== currentDiplomacy.id));
      announceDiplomacyUpdate();
    } catch { setError("요청 처리에 실패했습니다. 상태를 다시 확인해 주세요."); }
    finally { setBusy(false); }
  };

  const respondTrade = async (action: "ACCEPT" | "REJECT") => {
    if (!currentTrade?.proposal) return;
    setBusy(true); setError(null);
    try {
      await respondTradeProposal(country.key, currentTrade.proposal.id, action);
      await updateTradeNotification(country.key, currentTrade.id, "DISMISS");
      setTrade((items) => items.filter((item) => item.id !== currentTrade.id));
      announceEconomyUpdate();
    } catch { setError("무역 제안 처리에 실패했습니다. 상태를 다시 확인해 주세요."); }
    finally { setBusy(false); }
  };

  if (currentDiplomacy?.proposal) {
    const proposer = countryByKey(currentDiplomacy.counterpart_country_key);
    const proposal = currentDiplomacy.proposal;
    if (proposer) return (
      <RequestShell
        eyebrow={`외교 전문 · ${proposal.sent_world_date}`}
        title={`${PROPOSAL_LABELS[proposal.proposal_type]} 제안`}
        copy={`${withParticle(proposer.name, "이", "가")} ${withParticle(country.name, "에게", "에게")} 외교 협정 체결을 요청했습니다.`}
        proposer={proposer}
        country={country}
        onClose={() => setHiddenIds((ids) => new Set(ids).add(currentDiplomacy.id))}
        onAccept={() => void respondDiplomacy("ACCEPT")}
        onReject={() => void respondDiplomacy("REJECT")}
        busy={busy}
        error={error}
      >
        <div><dt>효력 시작</dt><dd>{proposal.proposed_start_world_date}</dd></div>
        <div><dt>효력 종료</dt><dd>{proposal.proposed_end_world_date ?? "기한 없음"}</dd></div>
      </RequestShell>
    );
  }

  if (currentTrade?.proposal) {
    const proposer = countryByKey(currentTrade.counterpart_country_key);
    const proposal = currentTrade.proposal;
    if (proposer) return (
      <RequestShell
        eyebrow={`무역 전문 · ${proposal.proposed_start_world_date}`}
        title="양자 무역 제안"
        copy={`${proposer.name}에서 자원 및 생산역량 교환안을 전달했습니다.`}
        proposer={proposer}
        country={country}
        onClose={() => setHiddenIds((ids) => new Set(ids).add(currentTrade.id))}
        onAccept={() => void respondTrade("ACCEPT")}
        onReject={() => void respondTrade("REJECT")}
        busy={busy}
        error={error}
      >
        {proposal.lines.map((line) => (
          <div key={line.id}>
            <dt>{line.from_country_key === country.key ? "제공" : "수령"}</dt>
            <dd>{line.asset_type === "RESOURCE" && line.resource_type_id ? RESOURCE_LABELS[line.resource_type_id] : "생산역량"} {line.amount_per_settlement}</dd>
          </div>
        ))}
      </RequestShell>
    );
  }

  if (diplomacy.length === 0 && trade.length === 0) return null;
  return <button type="button" className="diplomacy-request-reopen" onClick={() => setHiddenIds(new Set())}>외교·무역 요청 {diplomacy.length + trade.length}</button>;
}

type RequestShellProps = {
  eyebrow: string; title: string; copy: string; proposer: MapCountryIndex; country: MapCountryIndex;
  onClose: () => void; onAccept: () => void; onReject: () => void; busy: boolean; error: string | null;
  children: ReactNode;
};

function RequestShell({ eyebrow, title, copy, proposer, country, onClose, onAccept, onReject, busy, error, children }: RequestShellProps) {
  return (
    <div className="diplomacy-request-layer" role="presentation">
      <section className="diplomacy-request-modal" role="dialog" aria-modal="true" aria-labelledby="world-request-title">
        <header><span>{eyebrow}</span><button type="button" aria-label="요청 닫기" onClick={onClose}>×</button></header>
        <div className="diplomacy-request-modal__countries">
          <figure><CountryFlag country={proposer} flagPath={proposer.flagPath} /><figcaption>{proposer.name}</figcaption></figure>
          <div className="diplomacy-request-modal__signal" aria-hidden="true"><img src="/assets/ui/icons/diplomacy/direction-arrow.svg" alt="" /></div>
          <figure><CountryFlag country={country} flagPath={country.flagPath} /><figcaption>{country.name}</figcaption></figure>
        </div>
        <div className="diplomacy-request-modal__copy">
          <p>THE LONG REVOLUTION · WORLD OFFICE</p><h2 id="world-request-title">{title}</h2><p>{copy}</p>
          <dl>{children}</dl>{error ? <p className="diplomacy-request-modal__error" role="alert">{error}</p> : null}
        </div>
        <footer><button type="button" disabled={busy} onClick={onAccept}>수락</button><button type="button" disabled={busy} onClick={onReject}>거절</button></footer>
      </section>
    </div>
  );
}
