# NEW NAVI 재구축 완료 보고

분석 기준은 옛 아카이브 `89a16c095f68d75b0ad7548425652134fbc8ea32`와 작업 시작 시
TLR `c1cd7862c9362a9df2cb25be9bd70f35716380d4`이다.

## 1–5. 옛 기능과 분류

| 분류 | 옛 명령·기능 | 결과 |
| --- | --- | --- |
| KEEP | `/나비식당`, `/끝말잇기`, `/호감도`, 대사·호출 반응, blacklist 연동, 배지, 대표 배지 | 신규 SQLite와 정적 자산으로 이식 |
| KEEP+재구성 | `/상태창` | 국가 페이지는 TLR 실시간 값, NAVI·배지 페이지는 신규 SQLite |
| TLR_CLIENT | `/내국가`, `/국가`, `/국가운영`의 조회 부분 | `/내국가`, `/상태창`과 사이트 deep link로 재구축 |
| TLR_CLIENT | `/연구시작`, `/내연구`, `/연구`, `/연구즉시완료`, `/연구취소` | `/연구요청`, `/내연구`, `/연구력추가투입`, `/연구심사`로 정본 TLR API 호출 |
| TLR_CLIENT | `/경제통계`, 경제 조회 | `/경제`로 TLR 값만 조회 |
| TLR_CLIENT(대기) | `/내디시전`, `/디시전` | 명령과 API 경계는 구현, TLR 정본 백엔드가 없어 미지원 상태 반환 |
| REMOVE | `/국가목록`, `/국가등록`, `/ai국가등록`, `/국가삭제`, `/꾸미기`의 국가 원본 수정 | 국가·소유권 관리는 TLR 사이트로 이관 |
| REMOVE | `/연재방자동지정`, `/연재방생성` | 새 서버 구조가 제공되지 않아 옛 채널 구조를 생성하지 않음 |
| REMOVE | `/server_start`, `/server_reset`, `/업데이트반영`, `/관리 서버설정`, `/관리 기능설정`, `/관리 시간진행`, `/관리 국가승인`, `/관리 국가상태`, `/관리 자원지급`, `/관리 효과수정`, `/관리 경제성장` | 옛 LCW 운영·세계시간·국가효과 체계 제거, 사이트로 이관 |
| REMOVE | `/예산`, `/자원`, `/국민정신`, `/디시전등록`, `/디시전진행` | TLR 사이트가 담당; 별도 NAVI 원본을 만들지 않음 |
| REMOVE | `/관리 경제 삽입/조회/수정/삭제/자동설정/자동상태/즉시업데이트/수동이벤트/로그/경제랭킹채널/긍정이벤트설정/고급도움`, `/경제자동이벤트즉시생성`, `/랭킹` | 독립 경제 시뮬레이터와 옛 랭킹 제거 |
| REMOVE | `/첩보`, 첩보 현황판·DB | 사이트 「첩보 임무」로 이관; 분석 문서만 유지 |
| MODIFY | `/관리자채널`, `/관리자역할`, `/블랙리스트`, `/도움 시작` | 채널은 환경설정, 관리자는 TLR DB 권한, blacklist는 owner 운영 경로, 도움은 README로 단순화 |

TLR 사이트에 맡긴 정본 영역은 국가 목록·표시명, profile, 국가 소유권, 세계시간,
경제, 연구력, 연구 프로젝트·계산·심사·감사 로그, 향후 디시전·국민정신·첩보 임무다.

## 6–12. 구조, 설정, 데이터와 인증

6. 프로젝트 구조는 `navi/` 아래에 Python runtime, TLR client, 명령, 캐릭터·미니게임,
   정적 자산, 테스트만 배치했다. TLR 쪽은 `server/routes/navi/`, 단일 Vercel dispatcher,
   관리자 migration으로 구성했다.
7. 새 Discord Application의 `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`를 환경변수로
   넣는다. 대사와 게임에 Message Content, 부스트 배지에 Members intent만 요청한다.
8. 신규 SQLite에는 식당, 끝말잇기, 호감도, blacklist, 배지, 설정, 알림 cursor만 있다.
9. 옛 `nation_bot.sqlite3`, Railway DB, 사용자 행, guild/channel mapping은 복사하지 않았다.
10. 최초 실행 시 빈 SQLite schema를 만들고 정적 TSV 단어만 seed한다. 식당·호감도·배지
    진행도는 사용자 첫 이용 때 기본값에서 시작한다.
11. 전용 `TLR_NAVI_SERVICE_TOKEN` Bearer 인증을 쓰며 Bot에는 Supabase 관리자 키가 없다.
12. TLR 서버가 인증된 요청의 Discord ID로 active profile과 active country ownership을
    매번 찾는다. username, nickname, 입력 국가명은 신뢰하지 않는다.

## 13–17. TLR 연동 동작

13. `/내국가`는 TLR의 현재 국가명·stable key·국기·세계일·연구력·활성 연구를 읽고
    실제 `/play/:countryKey` 링크를 제공한다.
14. `/연구요청`은 사용자 국가를 서버에서 판정하고 정본 `research_projects`에
    `SUBMITTED`를 생성하며 `research_audit_logs`에 `NAVI` 출처를 남긴다.
15. `/연구심사`는 매 호출마다 TLR profile과 `navi_admin_members`를 확인한 뒤 기존 TLR
    승인 RPC 또는 동일 정본 상태 변경을 사용해 승인·반려·취소·즉시완료를 처리한다.
16. `/연구력추가투입`은 먼저 TLR preview RPC 결과를 표시하고 확정 시 같은 TLR invest RPC를
    고정 멱등 키로 호출한다. NAVI는 완료일이나 연구력 차감을 계산하지 않는다.
17. 사이트와 NAVI가 동일한 Supabase 행·RPC·감사 로그를 사용하므로 별도 동기화 DB가 없다.
    사이트 발생 이벤트도 감사 로그 polling으로 Discord에 전달할 수 있다.

## 18–23. NAVI 기능 이식

18. 나비식당의 조리, 재료·도구·레시피, 전용 재화, 부동산·손님·가구 흐름과 렌더 자산을
    이식했다. TLR GDP·예산과 연결하지 않았다.
19. 끝말잇기의 세션, 참가자, 턴, 중복 단어, 통계와 정적 사전을 이식했다. 옛 통계는 없다.
20. UTF-8 정적 대사팩의 1,200개 반응과 5단계 호감도 칭호, 호출 반응, dialogue runtime,
    호감도·일일 제한, blacklist 연동을 전량 이식했다. LCW 초대 링크와 고유 사용자 ID는 없다.
21. 구 정적 배지 정의 3종과 NEW NAVI 배지 1종, 신규 배지 보유·대표 배지 및 3페이지
    `/상태창`을 이식했다. 과거 사용자별 지급 기록은 복사하지 않았고 국가 페이지는 TLR API다.
22. 옛 국가 DB/repository, 국가별 JSON·이미지, 경제 자동 이벤트, 연구·디시전·국민정신,
    Discord 채널 매핑, server reset, espionage runtime과 secret을 가져오지 않았다.
23. 첩보 분석은 `docs/legacy-navi-espionage-analysis.md`에 별도로 남겼다.

## 24. 보안 변경

- Bot token, application ID, service token, owner ID는 코드에 없다.
- `.env`, 새 SQLite, preview, 가상환경은 git에서 제외한다.
- service token을 통과하지 않은 Discord ID 헤더는 무효이며 ID 형식도 검증한다.
- 관리자 기능은 Discord 역할이 아니라 TLR profile과 별도 관리자 allowlist를 확인한다.
- RLS가 켜진 `navi_admin_members`는 anon/authenticated 접근 권한을 회수했다.
- 연구 확정은 멱등 키를 사용하고, 알림 실패는 TLR 핵심 transaction과 분리했다.

## 25. 테스트 결과

최종 로컬 검증 결과는 다음과 같다.

- TLR: typecheck 통과, lint 통과, Vitest 14 files / 64 tests 통과, production build 통과
- NAVI: `compileall` 통과, unittest 통과(13개 Slash Command 충돌 없는 등록, 대사 1,200개 포함)
- 신규 DB에 국가·경제·연구·디시전·첩보 테이블이 없는지 확인
- TLR 현재 국가 catalog의 stable key·표시명 조회 확인
- 정적 대사 1,200개와 구 칭호·배지 정의 보존, LCW route/초대 링크 및 전용 호감도 emoji 제거 확인
- 식당 manifest와 이미지로 실제 화면 PNG 렌더 확인

Vite build에는 기존 단일 JavaScript chunk가 500 kB를 넘는 성능 경고가 있지만 빌드는
성공했다.

## 26. 실제 테스트 Discord 명령 스크린샷

미제공. 새 Discord Application token, 테스트 guild, TLR production service token과
Supabase migration 적용 권한이 이 작업 환경에 제공되지 않았다. 코드가 command tree를
동기화하는 것과 로컬 import·테스트는 검증하지만, 실제 Discord 서버 스크린샷을
생성했다고 보고하지 않는다.

## 27. 아직 연결되지 않은 부분

- 새 Discord Application 생성, production token 등록, 테스트 guild에서 실제 명령 확인
- production Supabase에 `202608110001_navi_integration.sql` 적용 및 관리자 profile 등록
- TLR과 Bot hosting 양쪽에 동일한 새 service token 설정
- Bot worker 상시 배포와 실제 알림 DM/관리자 채널 smoke test
- TLR 정본 디시전 백엔드·API가 생긴 뒤 `/내디시전` 결과 연결
- TLR 사이트의 첩보 임무 UI·도메인 구현과 향후 알림 이벤트 추가
- 실제 새 Discord 서버 구조가 결정된 뒤 연재방 기능을 KEEP/MODIFY/REMOVE로 재검토
- 현재 환경에 GitHub CLI `gh`가 없어 안전한 branch push·draft PR 게시를 완료하지 못함
- Vercel CLI와 `.vercel/project.json` 연결이 없어 production/preview 배포 상태를 확인하지 못함

이 항목들은 자격증명과 운영 환경 또는 별도 사이트 기능이 필요한 작업이며, 옛 데이터를
가져와 임시로 메우지 않았다.
