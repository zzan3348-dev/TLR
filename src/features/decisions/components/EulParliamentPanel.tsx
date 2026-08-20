import { useMemo, useState, type CSSProperties } from "react";
import { CountryFlag } from "../../../components/CountryFlag";
import type { MapCountryIndex } from "../../../types/mapCountry";
import {
  buildEulSeatMap,
  EUL_COMMON_ACTIONS,
  EUL_COUNTRY_ACTIONS,
  EUL_DEFAULT_AGENDA,
  EUL_PARLIAMENT_MEMBERS,
  type EulAgenda,
  type EulDecisionAction,
  type EulParliamentMember,
  type EulParliamentView,
  type EulVoteStance,
} from "../data/eulParliament";

type EulParliamentPanelProps = {
  country: MapCountryIndex;
  initialPoliticalPower?: number;
};

const ROW_COUNTS = [36, 42, 48, 54, 58, 62] as const;
const STANCE_LABELS: Record<EulVoteStance, string> = {
  YES: "찬성",
  NO: "반대",
  ABSTAIN: "기권",
  UNDECIDED: "미정",
};

const MEMBER_SEAT_COLORS = [
  "#a44742", "#854449", "#c5a64c", "#ad7040", "#77556e", "#4c7276", "#6f884e",
  "#a45e48", "#69658d", "#527889", "#865749", "#6d7c58", "#8c704b", "#725d7d",
] as const;

function memberSeatColor(member: EulParliamentMember) {
  return MEMBER_SEAT_COLORS[(member.rank - 1) % MEMBER_SEAT_COLORS.length];
}

function seatPoints() {
  let seatIndex = 0;
  return ROW_COUNTS.flatMap((count, rowIndex) => {
    const radius = 44 + rowIndex * 18;
    return Array.from({ length: count }, (_, index) => {
      const angle = (198 + (144 * index) / Math.max(1, count - 1)) * (Math.PI / 180);
      const point = {
        index: seatIndex,
        x: 150 + Math.cos(angle) * radius,
        y: 143 + Math.sin(angle) * radius,
      };
      seatIndex += 1;
      return point;
    });
  });
}

const SEAT_POINTS = seatPoints();

function stanceTotals(members: readonly EulParliamentMember[]) {
  return members.reduce<Record<EulVoteStance, number>>(
    (totals, member) => ({ ...totals, [member.stance]: totals[member.stance] + member.seats }),
    { YES: 0, NO: 0, ABSTAIN: 0, UNDECIDED: 0 },
  );
}

function actionBlockReason(
  action: EulDecisionAction,
  member: EulParliamentMember,
  agenda: EulAgenda | null,
  politicalPower: number,
  selectedTarget: number | null,
) {
  if (action.lockedReason) return action.lockedReason;
  if (politicalPower < action.cost) return `정치력 ${action.cost} 필요`;
  if (action.minimumInfluence && member.influence < action.minimumInfluence) return `연방 영향력 ${action.minimumInfluence} 필요`;
  if (action.requiresAgenda && (!agenda || agenda.phase !== "DELIBERATION")) return "심의 중인 안건 필요";
  if (action.requiresOwnAgenda && (!agenda || agenda.proposerCountryId !== member.country.id)) return "자국이 발의한 안건 필요";
  if (action.requiresUndecidedTarget && !selectedTarget) return "미정 회원국을 선택해야 함";
  return null;
}

export function EulParliamentPanel({ country, initialPoliticalPower = 240 }: EulParliamentPanelProps) {
  const [view, setView] = useState<EulParliamentView>("NORMAL");
  const [selectedCountryId, setSelectedCountryId] = useState(country.id);
  const [selectedStance, setSelectedStance] = useState<EulVoteStance | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [agenda, setAgenda] = useState<EulAgenda | null>(EUL_DEFAULT_AGENDA);
  const [politicalPower, setPoliticalPower] = useState(initialPoliticalPower);
  const [notice, setNotice] = useState("연방의회 관제망 연결 완료");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalThreshold, setProposalThreshold] = useState(151);

  const seats = useMemo(() => buildEulSeatMap(), []);
  const memberById = useMemo(() => new Map(EUL_PARLIAMENT_MEMBERS.map((member) => [member.country.id, member])), []);
  const currentMember = memberById.get(country.id) ?? EUL_PARLIAMENT_MEMBERS[0];
  const selectedMember = memberById.get(selectedCountryId) ?? currentMember;
  const totals = useMemo(() => stanceTotals(EUL_PARLIAMENT_MEMBERS), []);
  const visibleMembers = selectedStance ? EUL_PARLIAMENT_MEMBERS.filter((member) => member.stance === selectedStance) : EUL_PARLIAMENT_MEMBERS;
  const actions = [...EUL_COMMON_ACTIONS, ...EUL_COUNTRY_ACTIONS.filter((action) => action.countryId === country.id)];
  const undecidedTargets = EUL_PARLIAMENT_MEMBERS.filter((member) => member.country.id !== country.id && member.stance === "UNDECIDED");

  const inspectCountry = (countryId: number) => {
    setSelectedCountryId(countryId);
    setView("COUNTRY_INSPECT");
  };

  const executeAction = (action: EulDecisionAction) => {
    const blocked = actionBlockReason(action, currentMember, agenda, politicalPower, selectedTarget);
    if (blocked) {
      setNotice(blocked);
      return;
    }
    setPoliticalPower((value) => value - action.cost);
    if (action.id === "delay-vote" && agenda) setAgenda({ ...agenda, turnsRemaining: agenda.turnsRemaining + 1 });
    if (action.id === "withdraw-agenda") setAgenda(null);
    if (action.id === "early-vote" && agenda) setAgenda({ ...agenda, phase: "CONFIRMED", turnsRemaining: 0 });
    setNotice(`${action.title} 처리 완료`);
  };

  const submitProposal = () => {
    if (!proposalTitle.trim()) {
      setNotice("안건명을 입력해야 합니다.");
      return;
    }
    if (politicalPower < 100 || currentMember.influence < 50) {
      setNotice("안건 제출 조건을 만족하지 못했습니다.");
      return;
    }
    setPoliticalPower((value) => value - 100);
    setAgenda({
      id: `proposal-${Date.now()}`,
      title: proposalTitle.trim(),
      proposerCountryId: country.id,
      kind: "회원국 발의",
      threshold: proposalThreshold,
      turnsRemaining: 3,
      phase: "DELIBERATION",
    });
    setProposalOpen(false);
    setProposalTitle("");
    setNotice("새 안건이 연방의회에 제출되었습니다.");
    setView("VOTE");
  };

  return (
    <div className="eul-parliament" data-view={view}>
      <div className="eul-parliament__status">
        <span>의회 상태</span><strong>{notice}</strong><span>정치력</span><b>{politicalPower}</b>
      </div>

      <section className="eul-parliament__top">
        <figure className="eul-chancellor">
          <img src="/assets/eul/rosa-luxemburg.jpg" alt="로자 룩셈부르크" />
          <figcaption><small>유럽인민연방 3대 수상</small><strong>로자 룩셈부르크</strong></figcaption>
        </figure>

        <div className="eul-chamber">
          <div className="eul-chamber__toolbar" role="tablist" aria-label="연방의회 보기">
            <button type="button" aria-selected={view === "NORMAL"} onClick={() => { setView("NORMAL"); setSelectedStance(null); setSelectedCountryId(country.id); }}>현재 의석</button>
            <button type="button" aria-selected={view === "COUNTRY_INSPECT"} onClick={() => setView("COUNTRY_INSPECT")}>국가 검사</button>
            <button type="button" aria-selected={view === "VOTE"} onClick={() => setView("VOTE")}>표결 보기</button>
          </div>
          <svg className="eul-chamber__seats" viewBox="0 0 300 155" preserveAspectRatio="none" role="img" aria-label="총 300석 연방의회 의석도">
            {seats.map((seat, index) => {
              const member = memberById.get(seat.countryId);
              const point = SEAT_POINTS[index];
              if (!member || !point) return null;
              const active = view === "NORMAL" ? seat.countryId === country.id : view === "COUNTRY_INSPECT" ? seat.countryId === selectedCountryId : !selectedStance || member.stance === selectedStance;
              return (
                <circle
                  key={`${seat.countryId}-${seat.index}`}
                  className="eul-seat"
                  cx={point.x}
                  cy={point.y}
                  r="3.45"
                  data-active={active}
                  data-current={seat.countryId === country.id}
                  data-stance={view === "VOTE" ? member.stance : undefined}
                  style={{ "--eul-seat-color": memberSeatColor(member) } as CSSProperties}
                  tabIndex={0}
                  onClick={() => inspectCountry(seat.countryId)}
                ><title>{member.country.name} · {member.seats}석 · {STANCE_LABELS[member.stance]}</title></circle>
              );
            })}
          </svg>
          <div className="eul-chamber__summary"><strong>총 300석</strong><span>{view === "VOTE" ? "표결 배치" : `${selectedMember.country.name} ${selectedMember.seats}석`}</span></div>
        </div>
      </section>

      <button className="eul-agenda" type="button" onClick={() => setView("VOTE")}>
        <span>현재 안건</span>
        {agenda ? <><strong>{agenda.title}</strong><small>{memberById.get(agenda.proposerCountryId)?.country.name} 발의 · {agenda.kind} · 통과선 {agenda.threshold}표 · {agenda.turnsRemaining}턴</small></> : <><strong>상정된 안건 없음</strong><small>회원국의 새로운 발의를 대기하고 있습니다.</small></>}
      </button>

      <div className="eul-parliament__brief">
        <strong>연방의회</strong>
        <p>유럽인민연방의 공동 안건을 심의합니다. 회원국의 의석과 입장을 확인하고 정치행동을 통해 표결에 개입할 수 있습니다.</p>
      </div>

      <section className="eul-actions">
        <header><span>연방의회 정치행동</span><small>행동에 마우스를 올리면 조건과 효과를 확인할 수 있습니다.</small></header>
        {actions[0]?.requiresUndecidedTarget ? <label className="eul-actions__target"><span>접촉 대상</span><select value={selectedTarget ?? ""} onChange={(event) => setSelectedTarget(event.target.value ? Number(event.target.value) : null)}><option value="">미정 회원국 선택</option>{undecidedTargets.map((member) => <option value={member.country.id} key={member.country.id}>{member.country.name}</option>)}</select></label> : null}
        <div className="eul-actions__rows">{actions.map((action) => {
          const blocked = actionBlockReason(action, currentMember, agenda, politicalPower, selectedTarget);
          return <article className="decision-row eul-action-row" key={action.id} data-available={!blocked} title={blocked ?? action.description}><img className="decision-row__icon" src={action.icon} alt="" /><div className="decision-row__copy"><strong>{action.title}</strong><small>{action.description}</small></div><span className="decision-row__cost">{action.cost ? `정치력 ${action.cost}` : "비용 없음"}</span><span className="eul-action-row__lamp" aria-hidden="true" /><button className="decision-row__execute" type="button" disabled={Boolean(blocked)} onClick={() => executeAction(action)}>{blocked ? "잠김" : "실행"}</button><div className="eul-action-row__tooltip" role="tooltip"><strong>{action.title}</strong><p>{action.description}</p><span>{blocked ? `조건: ${blocked}` : `선택 시 효과: 정치력 ${action.cost} 소모`}</span></div></article>;
        })}</div>
        <button className="eul-actions__submit" type="button" disabled={politicalPower < 100 || currentMember.influence < 50} onClick={() => setProposalOpen(true)}>새 연방 안건 제출 · 정치력 100</button>
      </section>

      <section className="eul-parliament__middle">
        <article className="eul-country-inspector">
          <header><span>회원국 검사</span><b>영향력 순위 {selectedMember.rank}</b></header>
          <div className="eul-country-inspector__identity">
            <CountryFlag country={selectedMember.country} flagPath={selectedMember.country.flagPath} className="eul-flag" />
            <div><strong>{selectedMember.country.name}</strong><small>{selectedMember.country.nativeName}</small></div>
          </div>
          <dl><div><dt>의석</dt><dd>{selectedMember.seats} / 300</dd></div><div><dt>연방 영향력</dt><dd>{selectedMember.influence}</dd></div><div><dt>현재 입장</dt><dd data-stance={selectedMember.stance}>{STANCE_LABELS[selectedMember.stance]}</dd></div></dl>
        </article>

        <article className="eul-vote-board">
          <header><span>표결 현황</span><b>{agenda?.phase === "CONFIRMED" ? "표결 확정" : "심의 중"}</b></header>
          <div className="eul-vote-board__totals">
            {(Object.keys(STANCE_LABELS) as EulVoteStance[]).map((stance) => <button key={stance} type="button" data-stance={stance} aria-pressed={selectedStance === stance} onClick={() => { setSelectedStance((value) => value === stance ? null : stance); setView("VOTE"); }}><span>{STANCE_LABELS[stance]}</span><strong>{totals[stance]}</strong></button>)}
          </div>
          <div className="eul-vote-board__countries">{visibleMembers.map((member) => <button type="button" key={member.country.id} onClick={() => inspectCountry(member.country.id)}><CountryFlag country={member.country} flagPath={member.country.flagPath} className="eul-mini-flag" /><span>{member.country.name}</span><b>{member.seats}</b></button>)}</div>
        </article>
      </section>

      <section className="eul-member-ledger">
        <header><span>회원국 의석·영향력 기록</span><small>국기 또는 국가명을 선택해 검사</small></header>
        <div>{EUL_PARLIAMENT_MEMBERS.map((member) => <button key={member.country.id} type="button" data-selected={member.country.id === selectedCountryId} onClick={() => inspectCountry(member.country.id)}><CountryFlag country={member.country} flagPath={member.country.flagPath} className="eul-mini-flag" /><span>{member.country.name}</span><b>{member.seats}석</b><em>영향력 {member.influence}</em><i data-stance={member.stance}>{STANCE_LABELS[member.stance]}</i></button>)}</div>
      </section>

      {proposalOpen ? <div className="eul-proposal" role="dialog" aria-modal="true" aria-label="연방 안건 제출"><form onSubmit={(event) => { event.preventDefault(); submitProposal(); }}><header><strong>연방 안건 제출</strong><button type="button" onClick={() => setProposalOpen(false)}>×</button></header><label>안건명<input value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} autoFocus /></label><label>통과선<input type="number" min="151" max="300" value={proposalThreshold} onChange={(event) => setProposalThreshold(Number(event.target.value))} /></label><p>발의국 {country.name} · 영향력 {currentMember.influence} · 심의기간 3턴</p><button type="submit">의회에 제출</button></form></div> : null}
    </div>
  );
}
