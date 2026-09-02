import { useEffect, useMemo, useState } from "react";
import { EventPaperTemplate } from "../../events/components/EventPaperTemplate";
import { NewspaperEventTemplate } from "../../events/components/NewspaperEventTemplate";
import { SuperEventTemplate } from "../../events/components/SuperEventTemplate";
import type { DocumentEventData, EventChoice, NewspaperEventData, SuperEventData } from "../../events/types";
import { ConditionBuilder } from "./ConditionBuilder";
import { EffectBuilder } from "./EffectBuilder";
import { createEmptyEventDraft, type ManagementContentPayload, type ManagementEventDraft, type ManagementPublishState } from "../types";
import { mapCountries } from "../../../data/mapCountries";
import { COMMON_DECISIONS } from "../../decisions/data/commonDecisions";

const STATE_LABEL: Record<ManagementPublishState, string> = {
  DRAFT: "초안",
  READY: "검토 준비",
  PUBLISHED: "게시됨",
  ARCHIVED: "보관됨",
};
const DEV_EVENT: ManagementEventDraft = {
  ...createEmptyEventDraft(),
  id: "demo_event",
  title: "TLR 관리 콘솔 시험 이벤트",
  body: "세계시간과 턴은 서로 다른 진행 단위입니다.\n\n실제 이벤트 렌더러로 배치를 검토합니다.",
  updatedAt: "1932-01-01",
};
const DEV_CONTENT: ManagementContentPayload = {
  events: [DEV_EVENT],
  decisions: [...COMMON_DECISIONS],
  assets: [
    {
      id: "event-document",
      path: "/images/event-paper-template.png",
      label: "문서형 이벤트 프레임",
      kind: "event",
    },
    {
      id: "event-newspaper",
      path: "/images/event-newspaper-template.png",
      label: "신문형 이벤트 프레임",
      kind: "event",
    },
    {
      id: "event-super",
      path: "/images/super-event-frame.png",
      label: "슈퍼이벤트 프레임",
      kind: "event",
    },
  ],
  countries: mapCountries.slice(0, 8).map((country) => ({ key: country.key, name: country.name })),
  nationalSpirits: [],
};

function EventLivePreview({ event }: { event: ManagementEventDraft }) {
  const instanceId = `admin-preview:${event.id}`;
  if (event.templateType === "newspaper") {
    const preview: NewspaperEventData = {
      id: event.id,
      instanceId,
      title: event.title,
      body: event.body,
      image: event.image,
      imageCrop: event.imageCrop,
      choices: event.choices,
    };
    return <NewspaperEventTemplate event={preview} previewOnly />;
  }
  if (event.templateType === "super") {
    const preview: SuperEventData = {
      id: event.id,
      instanceId,
      title: event.title,
      image: event.image,
      imageCrop: event.imageCrop,
      quote: event.quote,
      attribution: event.attribution,
      choice: event.choices[0] ?? { id: "choice_1", text: "확인", effects: [] },
    };
    return <SuperEventTemplate event={preview} onFinished={() => undefined} previewOnly />;
  }
  const preview: DocumentEventData = {
    id: event.id,
    instanceId,
    title: event.title,
    body: event.body.split(/\n{2,}/u).filter(Boolean),
    choices: event.choices,
  };
  return <EventPaperTemplate event={preview} previewOnly />;
}

function AssetLibrary({ data, selected, onPick }: { data: ManagementContentPayload; selected?: string; onPick: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const assets = data.assets.filter((asset) => `${asset.label} ${asset.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <section className="management-asset-library">
      <header>
        <div>
          <span>ASSET LIBRARY</span>
          <h3>공용 에셋 선택</h3>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="에셋 검색" aria-label="에셋 검색" />
      </header>
      <div>
        {assets.map((asset) => (
          <button type="button" data-selected={selected === asset.path} onClick={() => onPick(asset.path)} key={asset.id}>
            <img src={asset.path} alt="" />
            <span>{asset.label}</span>
            <small>{asset.kind}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChoiceEditor({ choice, index, data, onChange, onRemove }: { choice: EventChoice; index: number; data: ManagementContentPayload; onChange: (choice: EventChoice) => void; onRemove: () => void }) {
  return (
    <article className="management-choice-editor">
      <header>
        <strong>선택지 {index + 1}</strong>
        <button type="button" onClick={onRemove} disabled={index === 0}>
          삭제
        </button>
      </header>
      <label>
        선택지 ID
        <input
          value={choice.id}
          onChange={(event) =>
            onChange({
              ...choice,
              id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/gu, "_"),
            })
          }
        />
      </label>
      <label>
        표시 문구
        <input value={choice.text} onChange={(event) => onChange({ ...choice, text: event.target.value })} />
      </label>
      <label>
        설명
        <textarea value={choice.description ?? ""} onChange={(event) => onChange({ ...choice, description: event.target.value })} />
      </label>
      <EffectBuilder value={choice.effects ?? []} countries={data.countries} spirits={data.nationalSpirits} onChange={(effects) => onChange({ ...choice, effects })} />
    </article>
  );
}

export function ContentStudio() {
  const visualPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("management-ui-preview") === "1";
  const [data, setData] = useState<ManagementContentPayload | null>(() => (visualPreview ? DEV_CONTENT : null));
  const [selectedId, setSelectedId] = useState<string | null>(() => (visualPreview ? DEV_EVENT.id : null));
  const [draft, setDraft] = useState<ManagementEventDraft | null>(() => (visualPreview ? structuredClone(DEV_EVENT) : null));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ManagementPublishState | "ALL">("ALL");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (visualPreview) return;
    let active = true;
    void fetch("/api/admin/content-studio", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("CONTENT_STUDIO_LOAD_FAILED");
        const payload = (await response.json()) as ManagementContentPayload;
        if (!active) return;
        setData(payload);
        const first = payload.events[0] ?? null;
        setSelectedId(first?.id ?? null);
        setDraft(first ? structuredClone(first) : null);
      })
      .catch(() => {
        if (active) setMessage("콘텐츠 스튜디오 데이터를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, [visualPreview]);

  const visible = useMemo(() => (data?.events ?? []).filter((event) => (filter === "ALL" || event.publishState === filter) && `${event.id} ${event.title}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [data, filter, query]);
  const updateChoice = (index: number, choice: EventChoice) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            choices: current.choices.map((item, itemIndex) => (itemIndex === index ? choice : item)),
          }
        : current,
    );
  const validate = (event: ManagementEventDraft) => {
    const issues: string[] = [];
    if (!/^[a-z0-9][a-z0-9_-]{2,79}$/u.test(event.id)) issues.push("이벤트 ID는 영문 소문자·숫자·_- 조합이어야 합니다.");
    if (!event.title.trim()) issues.push("제목이 필요합니다.");
    if (!event.body.trim() && event.templateType !== "super") issues.push("본문이 필요합니다.");
    if (!event.choices.length || event.choices.some((choice) => !choice.text.trim())) issues.push("모든 선택지에 문구가 필요합니다.");
    if (event.choices.some((choice) => (choice.effects ?? []).some((effect) => !effect.targetCountryIds.length))) issues.push("효과의 대상 국가를 선택해야 합니다.");
    if (event.targetCountryIds.length === 0) issues.push("이벤트를 받을 국가를 하나 이상 선택해야 합니다.");
    if (event.trigger.mode === "worldDateReached" && !event.trigger.worldDate) issues.push("날짜 발동에는 세계날짜가 필요합니다.");
    if ((event.trigger.mode === "turnStarted" || event.trigger.mode === "turnEnded") && !event.trigger.turnId) issues.push("턴 발동에는 턴 번호가 필요합니다.");
    return issues;
  };
  const save = async (publishState: ManagementPublishState, clone = false) => {
    if (!draft || !data) return;
    const next = { ...draft, publishState };
    const issues = validate(next);
    if (publishState === "PUBLISHED" && issues.length) {
      setMessage(issues.join(" "));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/content-studio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: clone ? "CLONE_EVENT" : "SAVE_EVENT",
          event: next,
        }),
      });
      const payload = (await response.json()) as ManagementContentPayload & {
        error?: string;
        focusedId?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "CONTENT_STUDIO_SAVE_FAILED");
      const nextId = clone ? (payload.focusedId ?? null) : next.id;
      const persisted = payload.events.find((event) => event.id === nextId) ?? null;
      setData(payload);
      setSelectedId(nextId);
      setDraft(persisted ? structuredClone(persisted) : next);
      setMessage(clone ? "복제본을 생성했습니다." : `${STATE_LABEL[publishState]} 상태로 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const schedule = async () => {
    if (!draft || !data || draft.publishState !== "PUBLISHED" || draft.targetCountryIds.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/content-studio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SCHEDULE_EVENT",
          eventId: draft.id,
          countryKeys: draft.targetCountryIds,
          availableWorldDate: deliveryDate,
        }),
      });
      const payload = (await response.json()) as ManagementContentPayload & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "EVENT_SCHEDULE_FAILED");
      const persisted = payload.events.find((event) => event.id === draft.id) ?? null;
      setData(payload);
      if (persisted) setDraft(structuredClone(persisted));
      setMessage(`${draft.targetCountryIds.length}개국에 ${deliveryDate}부터 표시되도록 예약했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이벤트 예약에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <section className="management-loading">{message ?? "콘텐츠 스튜디오 연결 중…"}</section>;
  return (
    <div className="management-workspace">
      <aside className="management-explorer">
        <header>
          <span>CONTENT EXPLORER</span>
          <h2>이벤트</h2>
          <button
            type="button"
            onClick={() => {
              const event = createEmptyEventDraft();
              setDraft(event);
              setSelectedId(null);
            }}
          >
            + 새 이벤트
          </button>
        </header>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID 또는 제목 검색" aria-label="콘텐츠 검색" />
        <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="게시 상태 필터">
          <option value="ALL">전체 상태</option>
          {Object.entries(STATE_LABEL).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="management-explorer__list">
          {visible.map((event) => (
            <button
              type="button"
              data-selected={event.id === selectedId}
              onClick={() => {
                setSelectedId(event.id);
                setDraft(structuredClone(event));
              }}
              key={event.id}
            >
              <strong>{event.title}</strong>
              <small>{event.id}</small>
              <span data-state={event.publishState}>{STATE_LABEL[event.publishState]}</span>
            </button>
          ))}
          {visible.length === 0 ? (
            <div className="management-empty-state">
              <strong>등록된 이벤트가 없습니다.</strong>
              <button
                type="button"
                onClick={() => {
                  const event = createEmptyEventDraft();
                  setDraft(event);
                  setSelectedId(null);
                }}
              >
                첫 이벤트 만들기
              </button>
            </div>
          ) : null}
        </div>
      </aside>
      <main className="management-editor">
        {draft ? (
          <>
            <header className="management-editor__header">
              <div>
                <span>EVENT STUDIO / {draft.templateType.toUpperCase()}</span>
                <h2>{draft.title}</h2>
              </div>
              <div>
                <button type="button" disabled={busy} onClick={() => void save("DRAFT")}>
                  초안 저장
                </button>
                <button type="button" disabled={busy} onClick={() => void save("READY")}>
                  검토 준비
                </button>
                <button className="is-primary" type="button" disabled={busy} onClick={() => void save("PUBLISHED")}>
                  게시
                </button>
                <button type="button" disabled={busy} onClick={() => void save("DRAFT", true)}>
                  복제
                </button>
                <button type="button" disabled={busy || !selectedId} onClick={() => void save("ARCHIVED")}>
                  보관
                </button>
              </div>
            </header>
            {message ? (
              <p className="management-editor__message" role="status">
                {message}
              </p>
            ) : null}
            <section className="management-form-grid">
              <label>
                이벤트 ID
                <input
                  value={draft.id}
                  disabled={Boolean(selectedId)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/gu, "_"),
                    })
                  }
                />
              </label>
              <label>
                템플릿
                <select
                  value={draft.templateType}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      templateType: event.target.value as ManagementEventDraft["templateType"],
                      choices: event.target.value === "super" ? draft.choices.slice(0, 1) : draft.choices,
                    })
                  }
                >
                  <option value="document">문서형</option>
                  <option value="newspaper">신문형</option>
                  <option value="super">슈퍼이벤트</option>
                </select>
              </label>
              <label className="is-wide">
                제목
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              {draft.templateType !== "super" ? (
                <label className="is-wide">
                  본문
                  <textarea rows={7} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
                </label>
              ) : (
                <>
                  <label className="is-wide">
                    인용문
                    <textarea rows={3} value={draft.quote ?? ""} onChange={(event) => setDraft({ ...draft, quote: event.target.value })} />
                  </label>
                  <label className="is-wide">
                    출처
                    <input value={draft.attribution ?? ""} onChange={(event) => setDraft({ ...draft, attribution: event.target.value })} />
                  </label>
                </>
              )}
            </section>
            <AssetLibrary data={data} selected={draft.image} onPick={(image) => setDraft({ ...draft, image })} />
            {draft.templateType !== "document" ? (
              <section className="management-crop-fields">
                <label>
                  가로 초점
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={draft.imageCrop.x}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        imageCrop: {
                          ...draft.imageCrop,
                          x: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  세로 초점
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={draft.imageCrop.y}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        imageCrop: {
                          ...draft.imageCrop,
                          y: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  확대
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.05"
                    value={draft.imageCrop.scale}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        imageCrop: {
                          ...draft.imageCrop,
                          scale: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </section>
            ) : null}
            <section className="management-targets">
              <header>
                <div>
                  <span>DELIVERY SCOPE</span>
                  <h3>표시 국가</h3>
                </div>
                <input aria-label="국가 검색" placeholder="국가 검색" value={countryQuery} onChange={(event) => setCountryQuery(event.target.value)} />
              </header>
              <div>
                {data.countries
                  .filter((country) => `${country.name} ${country.key}`.toLocaleLowerCase().includes(countryQuery.toLocaleLowerCase()))
                  .map((country) => (
                    <label key={country.key}>
                      <input
                        type="checkbox"
                        checked={draft.targetCountryIds.includes(country.key)}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            targetCountryIds: draft.targetCountryIds.includes(country.key) ? draft.targetCountryIds.filter((key) => key !== country.key) : [...draft.targetCountryIds, country.key],
                          })
                        }
                      />
                      <span>{country.name}</span>
                      <small>{country.key}</small>
                    </label>
                  ))}
              </div>
            </section>
            <section className="management-trigger">
              <header>
                <span>TRIGGER UNIT</span>
                <h3>발동 단위</h3>
              </header>
              <select
                value={draft.trigger.mode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    trigger: {
                      mode: event.target.value as ManagementEventDraft["trigger"]["mode"],
                    },
                  })
                }
              >
                <option value="manual">관리자 수동 예약</option>
                <option value="worldDateReached">세계날짜 도달</option>
                <option value="turnStarted">턴 시작</option>
                <option value="turnEnded">턴 종료</option>
                <option value="conditional">조건 충족</option>
              </select>
              {draft.trigger.mode === "worldDateReached" ? (
                <input
                  type="date"
                  value={draft.trigger.worldDate ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      trigger: {
                        ...draft.trigger,
                        worldDate: event.target.value,
                      },
                    })
                  }
                  aria-label="발동 세계날짜"
                />
              ) : null}
              {draft.trigger.mode === "turnStarted" || draft.trigger.mode === "turnEnded" ? (
                <input
                  type="number"
                  min="1"
                  value={draft.trigger.turnId ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      trigger: {
                        ...draft.trigger,
                        turnId: Number(event.target.value),
                      },
                    })
                  }
                  aria-label="발동 턴 번호"
                />
              ) : null}
              <p>세계날짜와 턴은 서로 독립적으로 발동합니다.</p>
              {draft.trigger.mode === "manual" ? (
                <div className="management-delivery-control">
                  <label>
                    표시 시작 세계날짜
                    <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
                  </label>
                  <button type="button" className="is-primary" disabled={busy || draft.publishState !== "PUBLISHED" || draft.targetCountryIds.length === 0} title={draft.publishState !== "PUBLISHED" ? "게시된 이벤트만 예약할 수 있습니다." : draft.targetCountryIds.length === 0 ? "표시 국가를 선택하십시오." : undefined} onClick={() => void schedule()}>
                    선택 국가에 예약
                  </button>
                  <small>누적 예약 {draft.deliveries.length}건</small>
                </div>
              ) : null}
            </section>
            <ConditionBuilder value={draft.conditions} countries={data.countries} onChange={(conditions) => setDraft({ ...draft, conditions })} />
            <section className="management-choices">
              <header>
                <span>CHOICE EDITOR</span>
                <h3>선택지와 실제 효과</h3>
              </header>
              {draft.choices.map((choice, index) => (
                <ChoiceEditor
                  key={`${choice.id}-${index}`}
                  choice={choice}
                  index={index}
                  data={data}
                  onChange={(next) => updateChoice(index, next)}
                  onRemove={() =>
                    setDraft({
                      ...draft,
                      choices: draft.choices.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                />
              ))}
              {draft.templateType !== "super" && draft.choices.length < 8 ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      choices: [
                        ...draft.choices,
                        {
                          id: `choice_${draft.choices.length + 1}`,
                          text: `선택지 ${draft.choices.length + 1}`,
                          effects: [],
                        },
                      ],
                    })
                  }
                >
                  + 선택지 추가
                </button>
              ) : null}
            </section>
          </>
        ) : (
          <p>왼쪽에서 이벤트를 선택하거나 새로 만드십시오.</p>
        )}
      </main>
      <aside className="management-preview">
        <header>
          <span>LIVE PREVIEW</span>
          <h2>실제 렌더러</h2>
        </header>
        {draft ? (
          <div className="management-preview__viewport">
            <EventLivePreview event={draft} />
          </div>
        ) : null}
        {draft ? (
          <section>
            <h3>게시 검증</h3>
            {validate(draft).length ? (
              validate(draft).map((issue) => (
                <p data-state="error" key={issue}>
                  × {issue}
                </p>
              ))
            ) : (
              <p data-state="ready">✓ 게시 가능한 상태입니다.</p>
            )}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

export function DecisionCatalog() {
  const visualPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("management-ui-preview") === "1";
  const [data, setData] = useState<ManagementContentPayload | null>(() => (visualPreview ? DEV_CONTENT : null));
  useEffect(() => {
    if (visualPreview) return;
    void fetch("/api/admin/content-studio", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: ManagementContentPayload) => setData(payload))
      .catch(() => setData(null));
  }, [visualPreview]);
  return (
    <section className="management-decision-catalog">
      <header>
        <div>
          <span>DECISION STUDIO / RUNTIME CATALOG</span>
          <h2>실행 중인 공통 결정 정의</h2>
        </div>
        <strong>{data?.decisions.length ?? 0}개</strong>
      </header>
      <p>현재 적용 중인 공통 결정 목록입니다.</p>
      <div>
        {data?.decisions.map((decision) => (
          <article key={decision.id}>
            <img src={decision.icon} alt="" />
            <div>
              <small>
                {decision.category} · {decision.id}
              </small>
              <h3>{decision.title}</h3>
              <p>{decision.description}</p>
              <ul>
                {decision.effects.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </div>
            <dl>
              <dt>정치력</dt>
              <dd>{decision.politicalPowerCost}</dd>
              <dt>재사용</dt>
              <dd>{decision.cooldownTurns}턴</dd>
              {decision.durationTurns ? (
                <>
                  <dt>효과 지속</dt>
                  <dd>{decision.durationTurns}턴</dd>
                </>
              ) : null}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
