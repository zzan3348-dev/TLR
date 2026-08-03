# TLR 외교 시스템 구현 기록

## 데이터 모델

- `world_state`: 현재 세계 날짜를 외교 만료와 협정 기간의 기준으로 사용한다.
- `country_ownerships`: 인증 사용자와 실제 플레이 국가를 연결하는 서버 측 권한 원본이다.
- `country_access_restrictions`: 국가별 또는 전체 플레이 제한을 기록한다.
- `country_relations`: `source_country_key → target_country_key` 방향별 기본 관계도다.
- `country_relation_modifiers`: 세력, 사건, 이념 등 관계도 가감 요인을 기간과 출처와 함께 저장한다.
- `country_relation_history`: 외교 행동과 협정 결과로 발생한 관계 변화 이력이다.
- `diplomatic_proposals`: 제안 종류, 양국, 검토 경로, 세계 날짜, 상태를 보존한다.
- `diplomatic_agreements`: 수락된 협정의 실제 효력과 기간을 보존한다.
- `diplomacy_notifications`: 플레이어에게 전달할 요청과 처리 결과를 보존한다.
- `diplomacy_events`: 외교 상태 전이 감사 이력이다.
- `diplomatic_action_cooldowns`: 관계 개선·악화 행동의 재사용 시점을 보존한다.
- `diplomacy_admin_reviews`: AI/미점유 국가 대신 관리자가 내린 결정을 감사한다.

모든 외교 테이블은 RLS를 활성화하고 `anon`, `authenticated` 직접 접근을 철회했다. 브라우저가 DB를 직접 변경하지 않으며, 서버의 service-role 연결을 거친다.

## 제안 상태 흐름

```text
PENDING ── 수락 ──> ACCEPTED ──> 협정 생성
   ├──── 거절 ───> REJECTED
   ├──── 철회 ───> WITHDRAWN
   ├──── 기한 ───> EXPIRED
   └─ 관리자 취소 -> CANCELLED
```

- 수락, 거절, 철회, 관리자 결정은 PostgreSQL 함수에서 행 잠금 후 원자적으로 처리한다.
- 수락 시 협정 생성, 양방향 관계 변화, 이벤트, 알림이 같은 트랜잭션에 포함된다.
- 관리자 결정은 `diplomacy_admin_reviews` 기록까지 같은 트랜잭션에 포함된다.
- 같은 국가 조합과 같은 종류의 중복 `PENDING` 제안은 부분 유니크 인덱스로 차단한다.
- 만료 함수는 API가 현재 세계 날짜를 읽을 때 실행되어 기한이 지난 요청과 협정을 정리한다.

## API

| 경로 | 메서드 | 기능 |
| --- | --- | --- |
| `/api/diplomacy/overview` | GET | 방향별 관계, 가감 요인, 이력, 제안, 협정, 행동 가능 여부 |
| `/api/diplomacy/actions` | POST | 관계 개선 또는 관계 악화 |
| `/api/diplomacy/proposals` | GET/POST/PATCH/DELETE | 제안 목록, 생성, 수락·거절, 철회 |
| `/api/diplomacy/notifications` | GET/PATCH | 요청 알림 조회, 읽음·숨김 처리 |
| `/api/admin/diplomacy` | GET/POST | 관리자 검토 큐, 수락·거절·취소 |

## 권한과 검증

- 일반 요청은 Supabase access token의 사용자와 `country_ownerships`의 활성 점유를 서버에서 다시 확인한다.
- 클라이언트가 보낸 발신 국가 키는 권한 원본으로 사용하지 않는다.
- 자기 자신에 대한 제안, 잘못된 국가 키, 잘못된 날짜 범위, 허용하지 않은 제안 종류와 상태 전이는 거절한다.
- 활성 플레이 제한이나 계정 차단 기록이 있으면 보호된 외교 API 접근을 거절한다.
- 대상 국가에 활성 플레이어가 있으면 `PLAYER`, 없으면 `ADMIN` 검토 경로를 고정한다. AI가 임의 확률로 응답하지 않는다.
- 개발용 행위자 주입은 비프로덕션이며 `DIPLOMACY_DEV_MODE=true`일 때만 별도 토큰으로 허용한다.
- DB 오류 원문과 내부 자격 증명은 응답에 노출하지 않는다.

## UI 동작

- 기존 정치창 프레임과 외교창 배치를 유지하면서 실제 관계도와 제안을 연결했다.
- 양국의 방향별 관계도를 각각 표시하며 0을 임의 기본값으로 사용하지 않는다.
- 플레이어 대상 제안은 요청 이벤트 모달로 전달되고, 미점유 대상은 관리자 큐에 들어간다.
- 요청 모달 닫기는 거절이 아니며 보류 요청 버튼으로 다시 열 수 있다.
- 알림은 마운트 시, 탭 복귀 시, 외교 변경 이벤트 시, 화면이 보이는 동안 30초 간격으로 갱신한다.
- 국기, 제안 종류, 시작·종료일, 수락·거절 상태를 실제 데이터로 표시한다.

## 필요한 서버 환경변수

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

개발 모드만 필요한 경우:

```text
DIPLOMACY_DEV_MODE=true
DIPLOMACY_DEV_TOKEN=<별도 비밀값>
```

프로덕션에서는 개발 모드를 켜지 않는다.

## 적용 순서

1. Supabase 프로젝트에 `supabase/migrations/202608030002_diplomacy.sql`을 적용한다.
2. Vercel Production/Preview 환경에 위 Supabase 환경변수를 등록한다.
3. 애플리케이션을 재배포한다.
4. 실제 사용자에게 활성 `country_ownerships` 행을 배정한다.
5. 프랑스(`country-013`), 독일(`country-008`), 바이에른(`country-017`)의 방향별 초기 관계가 보이는지 확인한다.

## 검증 시나리오

- 관계 개선/악화 후 방향별 점수와 이력이 갱신된다.
- 플레이어 대상 제안은 상대 요청 모달에 나타나고 닫은 뒤에도 보류 상태가 유지된다.
- 수락하면 제안은 `ACCEPTED`, 협정은 생성되며 양국 관계 변화가 함께 기록된다.
- 거절, 철회, 기한 만료, 관리자 취소가 각각 올바른 최종 상태를 만든다.
- 미점유 국가 대상 제안은 관리자 큐에서만 처리된다.
- 같은 제안의 중복 응답과 동시 응답 중 하나만 성공한다.
- 소유하지 않은 국가, 차단된 계정, 자기 자신, 변조된 국가 키 요청은 거절된다.
- 페이지 새로고침 후에도 보류 제안, 협정, 관계 이력이 유지된다.

현재 저장소만으로는 원격 Supabase 자격 증명을 알 수 없으므로, 마이그레이션의 실제 원격 적용과 인증 사용자 간 E2E 검증은 위 환경변수가 연결된 뒤 수행해야 한다.
