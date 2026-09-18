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
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

export function isAllowedTable(name: string): name is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(name);
}

/* ------------------------------------------------------------------ *
 * 직원 한 명을 지울 때 — 무엇이 남아 있으면 안 지우나 (2026-09-17)
 *
 * ★ 앱에서 직원을 빼도 **서버 줄이 남아서 다음에 화면을 열면 되살아났다.**
 *   `/api/data` 가 «덮어쓰기만 하고 지우지는 않는다» 였기 때문이다. 그 규율은
 *   태블릿 두 대일 때 늦게 연 기기가 남의 기록을 지우는 사고를 막는 것이고,
 *   **직원 한 명을 손으로 빼는 것과는 다른 일**이다. 그래서 줄 하나만 지우는
 *   길을 따로 냈다.
 *
 * ★ 다만 **기록이 있는 직원은 안 지운다.**
 *   출퇴근·근로계약은 근로기준법 제42조가 **3년 보관**을 요구하는 서류다.
 *   그만둔 사람이라고 지우면 나중에 임금 다툼이 났을 때 증거가 없다 —
 *   그리고 없앤 쪽이 매장이다. 그래서 여기서는 «못 지웁니다» 라고 말하고,
 *   왜인지도 화면에 적는다.
 *
 * ★ **근무 배정은 이 목록에 없다.** 그건 기록이 아니라 «계획» 이고, 앱도
 *   직원을 뺄 때 그 사람의 배정을 같이 지운다(`RosterView.removeStaff`).
 *   서버만 남겨두면 양쪽이 어긋난다.
 * ------------------------------------------------------------------ */

export const STAFF_BLOCKERS: Array<{ table: AllowedTable; label: string }> = [
  { table: "punches", label: "출퇴근" },
  { table: "contracts", label: "근로계약" },
];

/** 직원을 지울 때 같이 지우는 표 — 기록이 아니라 계획이다 */
export const STAFF_CASCADE: AllowedTable[] = ["shift_assignments"];

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
};
