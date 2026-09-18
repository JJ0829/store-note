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
  /* 근무표 (2026-09-16). `shifts` 는 조 이름·시간, `shift_assignments` 는
     «누가 언제 어느 조» 다. 조는 매장이 이름·시간만 고치고 새로 못 만든다
     (`shiftEdit.ts`) — 그래서 시드의 셋이 전부다. */
  "shifts",
  "shift_assignments",
  /* 레시피 (2026-09-18 · 이관순서 3단계).
     ★ **매장이 직접 추가한 레시피(`sop:recipes`)만** 여기로 간다.
       시드 레시피는 앱에 실려 나가는 내용물이라 매장 DB 에 안 넣는다 —
       기기를 바꿔도 안 사라지고, 넣으면 매장마다 같은 줄이 복제된다.

     앱의 레시피 하나가 서버에서는 표 넷으로 갈라진다:
       make_recipe_versions  «1배합이 얼마나 나오나» + 리드타임
       make_recipe_lines     «무엇이 얼마나» — 재료
       sections · steps      «어떻게 만드나» — 만드는 순서
     그리고 레시피의 주인은 `items` 한 줄이다 (`kind: "made"`).

     ★★ **`menu_` 가 아니라 `make_` 를 쓴다.** 둘 다 레시피 표인데
       `menu_recipe_versions` 에는 **`yield` 칸이 없다** — 파는 메뉴는
       «한 잔» 이 기준이라서다. 앱의 레시피는 전부 «1배합 = 몇 개» 를
       들고 있고 **그 값이 배수 계산의 기준**이다. `menu_` 로 올리면
       그것을 잃는다 — 이 제품이 종이를 이긴다고 말하는 바로 그 기능이다.
       `make_recipe_versions` 는 `yield_amount/unit/family` 에 더해
       `lead_time_hours` · `recoverable` 까지 갖고 있어 프렙과도 맞는다.
       판매가는 6단계에서 `menu_prices` 로 따로 옮긴다. */
  "make_recipe_versions",
  "make_recipe_lines",
  "sections",
  "steps",
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
  shifts: "id",
  /* ★ 배정에는 id 가 없다. 기본키가 «매장+직원+날짜» 다 —
     id 로 맞추면 근무표를 고칠 때마다 같은 날 같은 사람이 두 줄이 된다 */
  shift_assignments: "store_id,staff_id,business_date",
  make_recipe_versions: "id",
  make_recipe_lines: "id",
  sections: "id",
  steps: "id",
};
