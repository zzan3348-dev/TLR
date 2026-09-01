import { useState } from "react";
import { mapCountries } from "../../../data/mapCountries";
import { UiIcon } from "../../../components/UiIcon";
import { INTELLIGENCE_DOMAIN_LABELS } from "../data/intelligenceDefinitions";
import type { IntelligenceAdminData, IntelligenceDomain } from "../types";

type Props = {
  data: IntelligenceAdminData;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
};
const DOMAINS = Object.keys(INTELLIGENCE_DOMAIN_LABELS) as IntelligenceDomain[];
const countryName = (key: string) =>
  mapCountries.find((country) => country.key === key)?.name ?? key;
export function IntelligenceAdminSection({ data, onReload, onError }: Props) {
  const [selected, setSelected] = useState(
    data.operations.find(
      (operation) => operation.state === "PENDING_ADMIN_REVIEW",
    )?.id ?? "",
  );
  const [success, setSuccess] = useState("SUCCESS");
  const [detection, setDetection] = useState("UNDETECTED");
  const [attribution, setAttribution] = useState("UNATTRIBUTED");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [definition, setDefinition] = useState({
    key: "",
    displayName: "",
    description: "",
    domain: "UNDERGROUND",
    cost: 50,
    preparationDays: 20,
    infiltration: 40,
    assets: 1,
    iconAssetKey: "intelligence/operation",
  });
  const [upgrade, setUpgrade] = useState({
    key: "",
    displayName: "",
    description: "",
    category: "INFORMATION",
    cost: 35,
    durationDays: 20,
    iconAssetKey: "intelligence/agency",
  });
  const [networkControl, setNetworkControl] = useState({
    networkId: data.networks[0]?.id ?? "",
    field: "economy_infiltration",
    value: 0,
  });
  const [assetControl, setAssetControl] = useState({
    observerCountryId: mapCountries[0]?.key ?? "",
    targetCountryId: mapCountries[1]?.key ?? "",
    domain: "ECONOMY",
    quality: 50,
  });
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    onError(null);
    try {
      const response = await fetch("/api/admin/intelligence", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "첩보 관제 명령 실패");
      }
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "첩보 관제 명령 실패");
    } finally {
      setBusy(false);
    }
  };
  const pending = data.operations.filter(
    (operation) => operation.state === "PENDING_ADMIN_REVIEW",
  );
  const active = data.operations.filter(
    (operation) => operation.state === "ACTIVE",
  );
  return (
    <section
      className="directorate-diplomacy intelligence-admin"
      aria-labelledby="intelligence-admin-title"
    >
      <header>
        <div>
          <span>INTELLIGENCE CONTROL / CLASSIFIED</span>
          <h2 id="intelligence-admin-title">첩보 관제</h2>
        </div>
        <strong>
          {data.worldDate} · 검토 {pending.length} · 진행 {active.length}
        </strong>
      </header>
      <div className="intelligence-admin__summary">
        <span>
          기관 <b>{data.agencies.length}</b>
        </span>
        <span>
          첩보망 <b>{data.networks.length}</b>
        </span>
        <span>
          자산 <b>{data.assets.length}</b>
        </span>
        <span>
          보고서 <b>{data.snapshots.length}</b>
        </span>
        <span>
          이벤트 후보 <b>{data.eventCandidates.length}</b>
        </span>
      </div>
      <div className="intelligence-admin__columns">
        <div>
          <h3>관리자 검토 대기</h3>
          {pending.length ? (
            pending.map((operation) => (
              <button
                key={operation.id}
                type="button"
                data-active={selected === operation.id}
                onClick={() => setSelected(operation.id)}
              >
                <UiIcon
                  name={
                    data.operationDefinitions.find(
                      (definition) =>
                        definition.key === operation.definition_key,
                    )?.icon_asset_key ?? "intelligence/operation"
                  }
                />
                <span>
                  <strong>
                    {data.operationDefinitions.find(
                      (definition) =>
                        definition.key === operation.definition_key,
                    )?.display_name ?? operation.definition_key}
                  </strong>
                  <small>
                    {countryName(operation.observer_country_id)} →{" "}
                    {countryName(operation.target_country_id)}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p>대기 중인 작전이 없습니다.</p>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (selected && reason.trim())
              void post({
                action: "RESOLVE_OPERATION",
                operationId: selected,
                success,
                detection,
                attribution,
                reason,
              });
          }}
        >
          <h3>독립 판정 확정</h3>
          <label>
            성과
            <select
              value={success}
              onChange={(event) => setSuccess(event.target.value)}
            >
              <option value="SUCCESS">성공</option>
              <option value="FAILURE">실패</option>
            </select>
          </label>
          <label>
            발각
            <select
              value={detection}
              onChange={(event) => setDetection(event.target.value)}
            >
              <option value="UNDETECTED">미발각</option>
              <option value="DETECTED">발각</option>
            </select>
          </label>
          <label>
            귀속
            <select
              value={attribution}
              onChange={(event) => setAttribution(event.target.value)}
              disabled={detection === "UNDETECTED"}
            >
              <option value="UNATTRIBUTED">배후 불명</option>
              <option value="SUSPECTED">의심</option>
              <option value="ATTRIBUTED">귀속 확정</option>
            </select>
          </label>
          <label>
            판정 사유
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </label>
          <button disabled={busy || !selected || !reason.trim()} type="submit">
            미리보기 확인 후 확정
          </button>
        </form>
      </div>
      <details className="intelligence-admin__editor">
        <summary>첩보망·자산·정보 스냅샷 관리</summary>
        <div className="intelligence-admin__management">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void post({
                action: "ADJUST_NETWORK",
                ...networkControl,
                reason: reason || "관리자 첩보망 조정",
              });
            }}
          >
            <label>
              첩보망
              <select
                value={networkControl.networkId}
                onChange={(event) =>
                  setNetworkControl({
                    ...networkControl,
                    networkId: event.target.value,
                  })
                }
              >
                {data.networks.map((network) => (
                  <option key={network.id} value={network.id}>
                    {countryName(network.observer_country_id)} →{" "}
                    {countryName(network.target_country_id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              분야
              <select
                value={networkControl.field}
                onChange={(event) =>
                  setNetworkControl({
                    ...networkControl,
                    field: event.target.value,
                  })
                }
              >
                <option value="economy_infiltration">경제</option>
                <option value="administration_politics_infiltration">
                  행정·정치
                </option>
                <option value="research_infiltration">연구</option>
                <option value="military_infiltration">군사</option>
                <option value="underground_infiltration">지하조직</option>
                <option value="alertness">경계도</option>
              </select>
            </label>
            <label>
              수정값
              <input
                type="number"
                min="0"
                max="100"
                value={networkControl.value}
                onChange={(event) =>
                  setNetworkControl({
                    ...networkControl,
                    value: Number(event.target.value),
                  })
                }
              />
            </label>
            <button disabled={busy || !networkControl.networkId} type="submit">
              사유 기록 후 조정
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void post({
                action: "GRANT_ASSET",
                ...assetControl,
                reason: reason || "관리자 침투 자산 지급",
              });
            }}
          >
            <label>
              운영국
              <select
                value={assetControl.observerCountryId}
                onChange={(event) =>
                  setAssetControl({
                    ...assetControl,
                    observerCountryId: event.target.value,
                  })
                }
              >
                {mapCountries.map((country) => (
                  <option key={country.key} value={country.key}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              대상국
              <select
                value={assetControl.targetCountryId}
                onChange={(event) =>
                  setAssetControl({
                    ...assetControl,
                    targetCountryId: event.target.value,
                  })
                }
              >
                {mapCountries.map((country) => (
                  <option key={country.key} value={country.key}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              분야
              <select
                value={assetControl.domain}
                onChange={(event) =>
                  setAssetControl({
                    ...assetControl,
                    domain: event.target.value,
                  })
                }
              >
                {DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>
                    {INTELLIGENCE_DOMAIN_LABELS[domain]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              품질
              <input
                type="number"
                min="0"
                max="100"
                value={assetControl.quality}
                onChange={(event) =>
                  setAssetControl({
                    ...assetControl,
                    quality: Number(event.target.value),
                  })
                }
              />
            </label>
            <button
              disabled={
                busy ||
                assetControl.observerCountryId === assetControl.targetCountryId
              }
              type="submit"
            >
              자산 지급
            </button>
          </form>
        </div>
        <div className="intelligence-admin__snapshots">
          {data.snapshots
            .filter((snapshot) => snapshot.status !== "RETRACTED")
            .slice(0, 12)
            .map((snapshot) => (
              <article key={snapshot.id}>
                <span>
                  {countryName(snapshot.observer_country_id)} →{" "}
                  {countryName(snapshot.target_country_id)} ·{" "}
                  {INTELLIGENCE_DOMAIN_LABELS[snapshot.domain]}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void post({
                      action: "RETRACT_SNAPSHOT",
                      snapshotId: snapshot.id,
                      reason: reason || "관리자 정보 철회",
                    })
                  }
                >
                  철회
                </button>
              </article>
            ))}
        </div>
      </details>
      <details className="intelligence-admin__editor">
        <summary>신규 기관 개선 콘텐츠 편집기</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post({
              action: "UPSERT_UPGRADE_DEFINITION",
              ...upgrade,
              reason: reason || "관리자 기관 개선 편집",
              publish: true,
            });
          }}
        >
          <label>
            내부 key
            <input
              value={upgrade.key}
              onChange={(event) =>
                setUpgrade({ ...upgrade, key: event.target.value })
              }
              pattern="[a-z0-9_]+"
              required
            />
          </label>
          <label>
            표시 이름
            <input
              value={upgrade.displayName}
              onChange={(event) =>
                setUpgrade({ ...upgrade, displayName: event.target.value })
              }
              required
            />
          </label>
          <label>
            설명
            <input
              value={upgrade.description}
              onChange={(event) =>
                setUpgrade({ ...upgrade, description: event.target.value })
              }
            />
          </label>
          <label>
            분류
            <select
              value={upgrade.category}
              onChange={(event) =>
                setUpgrade({ ...upgrade, category: event.target.value })
              }
            >
              <option value="INFORMATION">정보</option>
              <option value="COUNTERINTELLIGENCE">방첩</option>
              <option value="OPERATIONS">작전</option>
              <option value="TRAINING">훈련</option>
              <option value="CRYPTOGRAPHY">암호</option>
            </select>
          </label>
          <label>
            정치력
            <input
              type="number"
              min="0"
              value={upgrade.cost}
              onChange={(event) =>
                setUpgrade({ ...upgrade, cost: Number(event.target.value) })
              }
            />
          </label>
          <label>
            소요일
            <input
              type="number"
              min="1"
              value={upgrade.durationDays}
              onChange={(event) =>
                setUpgrade({
                  ...upgrade,
                  durationDays: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            아이콘 key
            <input
              value={upgrade.iconAssetKey}
              onChange={(event) =>
                setUpgrade({ ...upgrade, iconAssetKey: event.target.value })
              }
            />
          </label>
          <button
            disabled={busy || !upgrade.key || !upgrade.displayName}
            type="submit"
          >
            게시
          </button>
        </form>
      </details>
      <details className="intelligence-admin__editor">
        <summary>신규 첩보 작전 콘텐츠 편집기</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post({
              action: "UPSERT_OPERATION_DEFINITION",
              ...definition,
              reason: reason || "관리자 콘텐츠 편집",
              publish: true,
            });
          }}
        >
          <label>
            내부 key
            <input
              value={definition.key}
              onChange={(event) =>
                setDefinition({ ...definition, key: event.target.value })
              }
              pattern="[a-z0-9_]+"
              required
            />
          </label>
          <label>
            표시 이름
            <input
              value={definition.displayName}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  displayName: event.target.value,
                })
              }
              required
            />
          </label>
          <label>
            설명
            <input
              value={definition.description}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  description: event.target.value,
                })
              }
            />
          </label>
          <label>
            대상 분야
            <select
              value={definition.domain}
              onChange={(event) =>
                setDefinition({ ...definition, domain: event.target.value })
              }
            >
              {DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {INTELLIGENCE_DOMAIN_LABELS[domain]}
                </option>
              ))}
            </select>
          </label>
          <label>
            정치력
            <input
              type="number"
              min="0"
              value={definition.cost}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  cost: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            준비일
            <input
              type="number"
              min="1"
              value={definition.preparationDays}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  preparationDays: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            요구 침투
            <input
              type="number"
              min="0"
              max="100"
              value={definition.infiltration}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  infiltration: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            요구 자산
            <input
              type="number"
              min="0"
              value={definition.assets}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  assets: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            아이콘 key
            <input
              value={definition.iconAssetKey}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  iconAssetKey: event.target.value,
                })
              }
            />
          </label>
          <article className="intelligence-operation-row">
            <UiIcon name={definition.iconAssetKey} />
            <div className="intelligence-operation-row__copy">
              <strong>{definition.displayName || "작전명 미입력"}</strong>
              <small>{definition.description || "실제 게임 UI 미리보기"}</small>
            </div>
            <span>정치력 {definition.cost}</span>
              <span className="intelligence-operation-row__preview-state">미리보기</span>
          </article>
          <button
            disabled={busy || !definition.key || !definition.displayName}
            type="submit"
          >
            게시
          </button>
        </form>
      </details>
    </section>
  );
}
