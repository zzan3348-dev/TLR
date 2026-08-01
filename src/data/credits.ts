export type CreditEntry = {
  role: string;
  person: string;
};

export const credits: CreditEntry[] = [
  { role: "총괄 기획", person: "김의진 (기타히어로)" },
  { role: "세계관 설정", person: "김의진 (기타히어로)" },
  { role: "지도 제작", person: "김의진 (기타히어로)" },
  { role: "웹사이트 제작", person: "김의진 (기타히어로)" },
  { role: "UI 및 그래픽", person: "김의진 (기타히어로)" },
  { role: "도움을 준 사람", person: "김의진 (기타히어로)" },
];

export const references = ["하츠 오브 아이언 4", "TFR", "TNO"] as const;
