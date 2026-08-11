# NEW NAVI 아키텍처

## 책임 경계

```text
Discord 사용자
  -> NEW NAVI (빠른 명령, 알림, 미니게임, 캐릭터 상태)
  -> TLR 전용 서버 API (서비스 인증 + Discord ID)
  -> TLR Supabase (profile, country ownership, 경제, 연구, 세계시간)
```

TLR이 국가 운영의 단일 원본이다. NEW NAVI의 SQLite에는 국가, 국가 소유권, 세계시간,
경제, 연구력, 연구 프로젝트, 디시전, 국민정신, 첩보 데이터를 저장하지 않는다.
국가 표시는 TLR 서버가 현재 `src/data/mapCountries.json`에서 읽고, 소유권은
`country_ownerships`에서 매번 조회한다. 국명 변경은 TLR 사이트 배포 후, 플레이어
소유권 변경은 DB 반영 즉시 NAVI 재배포 없이 보인다.

현재 TLR에는 영속 디시전 백엔드가 없고 국가 패널도 읽기 전용이다. `/내디시전` API는
가짜 데이터나 옛 LCW 데이터를 만들지 않고 `available: false`를 명시한다.

## 인증과 권한

- Bot과 TLR 서버는 동일한 최소 32자 `TLR_NAVI_SERVICE_TOKEN`을 환경변수로 가진다.
- 모든 `/api/navi/*` 요청은 Bearer token을 timing-safe 비교로 검증한다.
- 사용자 API는 검증된 서비스 요청의 `X-Discord-User-Id`만 받은 뒤
  `profiles.discord_user_id -> active country_ownerships.country_key`를 서버에서 찾는다.
- 사용자는 국가명을 입력해 자기 국가를 주장할 수 없다.
- 관리자 API는 국가 보유 여부와 별개로 활성 TLR profile을 확인한 뒤
  `navi_admin_members.active`와 `role`을 다시 확인한다. Discord 역할만 신뢰하지 않는다.
- Bot에는 Supabase service-role key를 넣지 않는다.

## TLR API

Vercel의 `/api/navi/:route`가 `api/navi-dispatch.ts`로 들어가 다음 제한 라우트로
분기된다.

| Route | Method | 역할 |
| --- | --- | --- |
| `me` | GET | 현재 profile의 국가·경제·활성 연구·세계일 조회 |
| `research` | GET/POST | 정본 연구 조회, `SUBMITTED` 요청 생성 |
| `research-investments` | POST | TLR RPC로 추가 투입 미리보기·확정 |
| `admin-research` | GET/POST | 관리자 목록, 승인·반려·취소·완료·종료일 조정 |
| `economy` | GET | 정본 국가 경제 조회 |
| `decisions` | GET | 현재 미지원 상태를 명시적으로 반환 |
| `events` | GET | 연구 감사 로그를 cursor 방식으로 조회 |

연구 미리보기와 완료일 계산, 연구력 차감은 전부 기존 TLR RPC가 수행한다. 확정 요청은
버튼 View 수명 동안 고정된 멱등 키를 사용한다. 연구 요청도 Discord interaction 기반
멱등 키와 `tlr_submit_research_project` RPC를 사용해 재전송이 중복 프로젝트를 만들지
않는다. 모든 연구력 투입은 `research_investments.source`에 SITE/NAVI/ADMIN/SYSTEM
출처를 남긴다.

알림은 별도 outbox가 아직 없는 현재 구조에 맞춰 `research_audit_logs`를 30초마다
polling한다. cursor는 NAVI SQLite의 `navi_event_state`에 저장한다. Discord 전송 실패가
TLR의 연구 transaction을 실패시키지 않는다. 이벤트는 해당 국가 소유자의 Discord DM을
우선하고, 실패하면 설정된 관리자 알림 채널로 보낸다. 신규 설치는 현재 최신 cursor에서
시작해 과거 연구 감사 로그를 알림으로 재생하지 않는다.

## NEW NAVI 런타임

```text
navi/
  main.py, Dockerfile, requirements.txt, .env.example
  navi_bot/
    bot.py, config.py, database.py, tlr_client.py
    commands/tlr.py, commands/social.py
    commands_restaurant.py, restaurant_tycoon_core.py, restaurant_render.py
    commands_word_chain.py
    affection_system.py, badge_system.py
    chat_reactions.py, navi_dialogues.py, navi_dialogue_runtime.py
    assets/, data/
  tests/
```

Message Content Intent는 호출 대사와 게임 대화 처리에, Server Members Intent는 부스트
배지 동기화에만 사용한다. token, application ID, guild ID, owner ID, 서비스 token은 모두
환경변수로 주입한다. `.env`, SQLite, preview 이미지, 가상환경은 git에서 제외한다.
호감도는 전용 Discord emoji를 사용하지 않고 모든 화면과 변화 알림에서 `❤️ +N`,
`❤️ 0`, `❤️ -N` 형식으로 표시한다.

캐릭터 정적 콘텐츠는 구 NAVI 최종 대사팩의 1,200개 반응과 5단계 칭호를 전량
이식했다. 구 배지 정의(`NAVI 아빠`, `관리진 후원자`, `가위바위보 사범님`)도
보존하고 NEW NAVI의 `끝말잇기 달인`을 추가한다. 사용자별 호감도와 배지 지급 기록은
이식 대상이 아니며 새 SQLite에서 다시 시작한다.

## 신규 SQLite

실행 시 빈 파일에서 schema를 새로 만든다. 표의 범주 외 데이터는 없다.

- NAVI 공통: 설정, 메시지 claim, blacklist, event cursor
- 캐릭터: 호감도·일일치·로그, 전역 배지·사용자 보유·대표 배지
- 나비식당: 프로필, 인벤토리, 도구, 해금, 레시피 기록, 조리 세션·로그,
  전용 재화, 타이쿤 프로필·세션·부동산·가구·고객 기록
- 끝말잇기: 정적 단어 사전, 세션, 플레이어, 사용 단어, 신규 통계, seed metadata

단어 사전과 식당 manifest·이미지는 정적 자산으로만 재사용한다. 이전 사용자 행은
복사하지 않으며, 첫 명령 시 기본값으로 신규 행이 만들어진다. 식당 재화·호감도·배지는
TLR 경제나 연구 수치에 영향을 주지 않는다.
