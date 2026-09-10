const LABELS: Record<string, string> = {
  DRAFT: "초안", READY: "준비됨", PUBLISHED: "게시됨", ARCHIVED: "보관됨",
  ACTIVE: "진행 중", INACTIVE: "비활성", PENDING: "대기", SUBMITTED: "접수됨",
  UNDER_REVIEW: "검토 중", APPROVED: "승인됨", REJECTED: "반려됨", CANCELLED: "취소됨",
  COMPLETED: "완료", SUSPENDED: "중지됨", BREACHED: "위반", TERMINATED: "종료됨",
  OPEN: "진행 중", CLOSED: "종료됨", PARTIAL: "일부 설정", DISABLED: "비활성",
  PENDING_ADMIN_REVIEW: "관리자 검토 대기", PREPARING: "준비 중", RESOLVED: "판정 완료",
  IDEOLOGY_CATEGORY_IS: "사상 계열 일치", IDEOLOGY_CATEGORY_IS_NOT: "사상 계열 불일치",
  IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST: "사상 지지도 이상", IDEOLOGY_CATEGORY_SUPPORT_AT_MOST: "사상 지지도 이하",
  CIVIL_WAR_SPECTRUM_IS: "내전 성향 일치", CIVIL_WAR_SPECTRUM_IS_NOT: "내전 성향 불일치",
  HAS_GRAND_DOCTRINE: "대교리 보유", DOES_NOT_HAVE_GRAND_DOCTRINE: "대교리 미보유",
  HAS_OFFICER_SPIRIT: "장교단 정신 보유", DOES_NOT_HAVE_OFFICER_SPIRIT: "장교단 정신 미보유",
  HAS_LAW: "법률 적용", DOES_NOT_HAVE_LAW: "법률 미적용",
  COUNTRY_STAT_AT_LEAST: "국가 수치 이상", COUNTRY_STAT_AT_MOST: "국가 수치 이하",
  WORLD_DATE_AFTER: "세계날짜 이후", WORLD_DATE_BEFORE: "세계날짜 이전", CUSTOM_ADMIN_FLAG: "관리자 지정 조건",
};
export function managementLabel(value: string | null): string { return value ? LABELS[value] ?? value : "미설정"; }
