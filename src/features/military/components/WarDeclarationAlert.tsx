import { useEffect, useMemo, useRef, useState } from "react";
import { CountryFlag } from "../../../components/CountryFlag";
import { mapCountries } from "../../../data/mapCountries";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { acknowledgeMilitaryNotification, fetchMilitaryConflicts, fetchWarDeclarations } from "../militaryClient";
import type { Conflict, MilitaryNotification } from "../types";

function playOriginalWarAlert(): void {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  master.connect(context.destination);
  [92, 138].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.78, now + 1);
    gain.gain.value = index === 0 ? 0.55 : 0.35;
    oscillator.connect(gain); gain.connect(master);
    oscillator.start(now); oscillator.stop(now + 1.12);
  });
  window.setTimeout(() => void context.close(), 1400);
}

function representative(conflict: Conflict | undefined, sideIndex: number): MapCountryIndex | null {
  const key = conflict?.sides?.[sideIndex]?.participants?.find((row) => row.country_key)?.country_key;
  return mapCountries.find((country) => country.key === key) ?? null;
}

export function WarDeclarationAlert() {
  const [notifications, setNotifications] = useState<MilitaryNotification[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const soundedRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([fetchWarDeclarations(), fetchMilitaryConflicts()]).then(([nextNotifications, nextConflicts]) => {
      if (active) { setNotifications(nextNotifications); setConflicts(nextConflicts); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const current = notifications[0] ?? null;
  const conflict = useMemo(() => conflicts.find((row) => row.id === current?.conflict_id), [conflicts, current?.conflict_id]);
  useEffect(() => {
    if (!current || soundedRef.current === current.id) return;
    soundedRef.current = current.id;
    playOriginalWarAlert();
  }, [current]);
  if (!current) return null;
  const attacker = representative(conflict, 0);
  const defender = representative(conflict, 1);
  const dismiss = async () => {
    setNotifications((rows) => rows.filter((row) => row.id !== current.id));
    try { await acknowledgeMilitaryNotification(current.id); } catch { /* 다음 접속 때 다시 표시 */ }
  };
  return <div className="war-declaration-alert" role="alertdialog" aria-modal="true" aria-labelledby="war-declaration-title">
    <div className="war-declaration-alert__panel">
      <div className="war-declaration-alert__flags">
        {attacker ? <figure><CountryFlag country={attacker} flagPath={attacker.flagPath} /><figcaption>{attacker.name}</figcaption></figure> : <span />}
        <h2 id="war-declaration-title">선전포고!</h2>
        {defender ? <figure><CountryFlag country={defender} flagPath={defender.flagPath} /><figcaption>{defender.name}</figcaption></figure> : <span />}
      </div>
      <p>{current.body}</p>
      <button type="button" onClick={() => void dismiss()}>확인</button>
    </div>
  </div>;
}
