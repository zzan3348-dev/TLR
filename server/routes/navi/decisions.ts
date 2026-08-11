import type { ApiRequest, ApiResponse } from "../../types.js";
import { requireNaviActor, requireNaviAdminClient } from "../../naviAuth.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const admin = requireNaviAdminClient(request, response);
  if (!admin) return;
  const actor = await requireNaviActor(request, response, admin);
  if (!actor) return;
  // TLR의 현재 디시전 화면은 정적 비활성 UI이며 canonical 테이블이 아직 없다.
  // 가짜 상태를 만들거나 옛 NAVI 데이터를 복제하지 않고 명시적으로 미지원 상태를 반환한다.
  response.status(200).json({
    countryKey: actor.countryKey,
    available: false,
    decisions: [],
    message: "TLR 디시전 백엔드가 연결되면 이 조회가 자동으로 활성화됩니다.",
  });
}
