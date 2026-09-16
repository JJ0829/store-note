/* ------------------------------------------------------------------ *
 * 서버에 올려도 되는 표 — 딱 이것만
 *
 * ★ 왜 화이트리스트인가
 *   `/api/data/[table]` 은 주소의 한 조각을 그대로 표 이름으로 쓴다.
 *   목록이 없으면 `/api/data/users` 처럼 **아무 표나 부를 수 있다.**
 *   RLS 가 한 겹 더 막지만, 막는 곳이 하나뿐이면 그게 뚫릴 때 끝이다.
 *
 * ★ 표를 늘릴 때는 이 목록과 `tests/serverData.test.ts` 를 같이 고친다.
 *   그 테스트가 «주소로 아무 표나 부를 수 없다» 를 못 박는다.
 * ------------------------------------------------------------------ */

export const ALLOWED_TABLES = [
  "staff",
  "punches",
  "contracts",
  "daily_sales",
  /* 거래처 (2026-09-16) — 앱의 품목 하나가 서버에서는 표 둘로 갈라진다.
     `items` 는 «무엇인가», `item_versions` 는 «얼마인가». */
  "suppliers",
  "items",
  "item_versions",
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

export function isAllowedTable(name: string): name is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(name);
}

/* ------------------------------------------------------------------ *
 * 「같은 줄」을 무엇으로 보는가 (2026-09-14)
 *
 * ★ 대부분은 `id` 다. 브라우저가 줄마다 id 를 들고 있기 때문이다.
 *
 * ★ **매출은 아니다.** 화면의 매출 기록(`sop:sales`)은 «날짜 → 하루치» 라서
 *   줄에 id 가 없다. 그리고 표에 이미 자연 열쇠가 있다 —
 *   `unique (store_id, business_date)`.
 *
 *   여기서 `id` 로 맞추면 마감을 고칠 때마다 **새 줄이 쌓이고**, 같은 날이
 *   두 줄이 되면서 유일 제약에 걸려 조용히 실패한다.
 *   (id 를 날짜로 만들어 내는 방법도 있지만, 브라우저는 `store_id` 를
 *    모르므로 매장이 둘이 되는 순간 id 가 부딪친다)
 * ------------------------------------------------------------------ */
export const CONFLICT_KEY: Record<AllowedTable, string> = {
  staff: "id",
  punches: "id",
  contracts: "id",
  daily_sales: "store_id,business_date",
  suppliers: "id",
  items: "id",
  item_versions: "id",
};
