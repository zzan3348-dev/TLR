# 관리자 UI 개편 전 기능 스냅샷

기준: `d5da641`, 2026-09-10. 작업 시작 시 git diff 없음. 기존 테스트 37개 파일 / 150개 통과.

## 보존 대상

| 화면 | 기존 조작·입력 | 연결 |
| --- | --- | --- |
| 운영 | 세계날짜·턴, 군사/첩보/연구/외교/무역/시간 요청 건수, 바로 이동, 로드 재시도 | 각 도메인 관리자 GET API 독립 로드 |
| 이벤트 | 생성, ID·제목·유형·본문·인용·출처, 초안/검토준비/게시/보관, 복제 | `/api/admin/content-studio`, event_definitions / event_choices |
| 이벤트 이미지 | 정적 에셋 선택, x/y/scale 편집 | payload.image / imageCrop; 신문·슈퍼 렌더러 |
| 이벤트 대상·발동 | 국가 다중 선택·검색, 수동/날짜/턴 시작/턴 종료/조건, 게시 후 예약 | SCHEDULE_EVENT, payload.deliveries, 실제 eventRuntime |
| 조건·선택지 | ALL/ANY, 국가/안정도/전쟁지지도/전쟁/사상/날짜/턴, 선택지 ID·문구·설명·효과, 추가·삭제 | 기존 ConditionBuilder / EffectBuilder, 서버 검증 |
| 이벤트 미리보기 | 문서·신문·슈퍼 3종, 게시 검증 | 플레이와 동일한 EventPaperTemplate / NewspaperEventTemplate / SuperEventTemplate |
| 디시전 | 공통 결정 카탈로그·설명·효과·비용·재사용·지속 조회 | COMMON_DECISIONS. 기존에 쓰기 API 없음 |
| 세계시간 | 상황 미리보기·확정, 날짜 이동 미리보기·확정, 요청 조회, 날짜 단축 | 기존 WorldControlAdminSection 및 관리자 API |
| 군사 | 카탈로그·장교·정치지원, 전쟁·전선·점령, 작전 판정 | 기존 MilitaryAdminSection 및 관리자 API |
| 첩보 | 작전 판정·망 조정·자산 지급·보고 철회·정의 게시 | 기존 IntelligenceAdminSection 및 관리자 API |
| 연구 | 승인·반려·일정·완료·취소·연구력 조정 | 기존 ResearchAdminSection 및 관리자 API |
| 경제·외교 | 제안 승인·거절·취소, 계약 정지·복구·종료 | 기존 관리자 API |
| 지역·수도 | 지도 선택·저장·수정·삭제 | ProvinceRegionAdminSection / MapCapitalAdminSection |
| 시스템 | 개장·미리보기·회원·추방 | 기존 컴포넌트·관리자 인증 |

## 확인된 구현 경계

- 관리자 세션 검증과 서버 requireAdminSession 유지. 개발용 UI 미리보기는 DEV에서만 존재.
- 실제 운영 storage.buckets 조회 결과 0개. 기존 파일 업로드 API·Storage 경로 없음. 직접 업로드는 기존 Supabase 프로젝트에 전용 버킷과 관리자 서명 발급으로 추가한다.
- 문서형 렌더러는 이미지 필드 없음. 신문형·슈퍼이벤트는 image/imageCrop 사용.
- 국민정신·특수 메커니즘 독립 CRUD와 디시전 수정은 기존 구현에 없음. UI 개편으로 가짜 저장 기능을 만들지 않는다.
- 이벤트 영구 삭제는 기존에 없음. 보관을 유지한다.

## 변경 후 확인

기존 핸들러·권한·저장 필드를 보존하고, 실제 브라우저 검증과 자동화 결과를 최종 보고에 별도 기록한다. 개발 미리보기나 API 모의 응답 검증을 운영 E2E 성공으로 취급하지 않는다.
