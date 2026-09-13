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

export const ALLOWED_TABLES = ["staff", "punches", "contracts"] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

export function isAllowedTable(name: string): name is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(name);
}
