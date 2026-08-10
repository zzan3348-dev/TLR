# TLR 연구 시스템 · NAVI 연동 계약

NAVI는 연구 데이터를 별도로 저장하지 않는다. 사이트와 동일한 연구 API를 사용하며, 서버가 국가 운영권과 현재 세계 날짜를 검증한다.

## 인증

- 브라우저: 현재 TLR 세션 쿠키
- NAVI 서비스: 향후 발급할 서버 간 Bearer 토큰
- 클라이언트가 보낸 `countryKey`, 잔액, 완료일은 신뢰하지 않는다.
- 관리 작업은 bootstrap 또는 Discord 관리자 세션이 필요하다.

## 국가 연구 조회

`GET /api/research/overview`

응답에는 `worldDate`, 연구력 잔액, 정산 주기당 수입, 연구 분류와 해당 국가 프로젝트가 포함된다.

## 연구 요청

`POST /api/research/projects`

```json
{
  "title": "장거리 무선 통신망",
  "categoryId": "general",
  "description": "연구 배경과 제안 내용",
  "objective": "달성할 목표",
  "prerequisites": "선행 조건",
  "initialInvestment": 120
}
```

제출 시 연구력은 차감되지 않는다. 관리자 승인 시 잔액을 다시 확인하고 충분한 경우에만 `ACTIVE`로 전환하며 최초 연구력을 원자적으로 차감한다.

## 추가 투자 미리보기와 확정

`POST /api/research/investments`

미리보기:

```json
{ "action": "PREVIEW", "projectId": "uuid", "amount": 50 }
```

확정:

```json
{
  "action": "CONFIRM",
  "projectId": "uuid",
  "amount": 50,
  "idempotencyKey": "navi-message-id-or-uuid"
}
```

`idempotencyKey`는 국가별로 고유해야 한다. 같은 키의 재전송은 중복 차감하지 않는다. 추가 투자는 `ACTIVE` 프로젝트에만 허용된다.

## 관리자 심사

`GET /api/admin/research`

`POST /api/admin/research`

지원 작업:

- `APPROVE`: `projectId`, `durationDays`, 선택적 `note`
- `REJECT`: `projectId`, `note`
- `ADJUST_END_DATE`: `projectId`, `completionDate` (`YYYY-MM-DD`)
- `FORCE_COMPLETE`: `projectId`
- `CANCEL`: `projectId`
- `ADJUST_POINTS`: `countryKey`, `amount`, `note`

## 상태 전이

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE → COMPLETED`

심사 결과에 따라 `REJECTED`, 운영 중단에 따라 `CANCELLED`로 전환할 수 있다. 잔액 부족으로 승인은 되었으나 시작하지 못한 프로젝트는 `APPROVED`에 남는다. 연구 취소와 완료는 이미 투입한 연구력을 반환하지 않는다.

## 세계 시간과 효과 적용

- 완료 판정은 현실 시계가 아닌 `world_state.current_world_date`를 사용한다.
- 완료 프로젝트의 효과는 `research_effects`에 구조화하여 기록한다.
- 효과를 실제 국가 수치에 반영하는 후속 처리기는 `effect_key`와 `effect_payload`만 읽고, 설명문을 파싱하지 않는다.
- 모든 심사·투자·조정은 `research_audit_logs`에 기록한다.
