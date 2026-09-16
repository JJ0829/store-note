/* ------------------------------------------------------------------ *
 * 단위 환산.
 *
 * 원가 계산은 거의 전부 여기서 틀어진다.
 * 레시피는 "강력분 2000g"인데 거래처는 "밀가루 20kg 한 포대 34,000원"으로
 * 판다. 둘을 같은 단위로 맞추지 못하면 원가가 1000배 틀린다.
 *
 * ★ 규칙 하나만 지킨다: 계열이 다르면 계산하지 않는다.
 *
 * g과 ml은 서로 안 바꾼다. 물이면 1:1이지만 밀가루는 0.55쯤이고
 * 우유는 1.03, 오일은 0.92다. 밀도를 모르는 채 바꾸면 조용히 틀린 값이
 * 나오고, 사람은 그게 틀린 줄 모른다. 화면에는 "단위가 안 맞습니다"라고
 * 그대로 띄운다. **틀린 원가율은 빈 칸보다 나쁘다.**
 *
 * 개수 단위(개·장·팩·봉·스쿱)도 서로 안 바꾼다. "슬라이스 치즈 100장"과
 * "치즈 2개"는 같은 게 아니다. 이름이 똑같을 때만 계산한다.
 * ------------------------------------------------------------------ */

/** 같은 계열 안에서만 환산한다 */
export type Family = string;

type Unit = { family: Family; perBase: number };

/**
 * 기준 단위는 무게 g, 부피 ml.
 * 키는 전부 소문자로 맞춰서 찾는다 ("KG"도 "kg"으로 들어온다).
 */
const TABLE: Record<string, Unit> = {
  // 무게
  mg: { family: "weight", perBase: 0.001 },
  g: { family: "weight", perBase: 1 },
  그램: { family: "weight", perBase: 1 },
  kg: { family: "weight", perBase: 1000 },
  킬로: { family: "weight", perBase: 1000 },
  킬로그램: { family: "weight", perBase: 1000 },

  // 부피
  ml: { family: "volume", perBase: 1 },
  cc: { family: "volume", perBase: 1 },
  밀리: { family: "volume", perBase: 1 },
  l: { family: "volume", perBase: 1000 },
  리터: { family: "volume", perBase: 1000 },
};

/**
 * 개수 단위는 표에 없다. 이름이 정확히 같을 때만 1:1로 센다.
 * 표에 없는 단위를 만나면 그 단위 이름 자체가 계열이 된다.
 */
function lookup(unit: string): Unit {
  const key = unit.trim().toLowerCase();
  const hit = TABLE[key];
  if (hit) return hit;
  // "개"는 "개" 계열, "장"은 "장" 계열. 서로 안 섞인다.
  return { family: `as:${key}`, perBase: 1 };
}

/** 두 단위를 같은 계산에 쓸 수 있는가 */
/**
 * 그 단위가 어느 계열인가 — `weight` · `volume` · `count` · `as:장` …
 *
 * ★ 서버로 보낼 때 필요하다 (2026-09-16). `items.base_family` 와
 *   `item_versions.pack_family` 가 **같아야 한다**는 외래키가 걸려 있고,
 *   `units(code, family)` 에 없는 계열은 통째로 거절당한다.
 *   앱과 서버가 서로 다른 계열 이름을 쓰면 그 품목만 조용히 안 올라간다.
 */
export function familyOf(unit: string): Family {
  return lookup(unit).family;
}

export function sameFamily(a: string, b: string): boolean {
  return lookup(a).family === lookup(b).family;
}

/**
 * `from` 단위의 수량을 `to` 단위로 바꾼다.
 * 계열이 다르면 **null**. 0을 돌려주면 원가가 0원으로 보여서 더 위험하다.
 */
export function convert(amount: number, from: string, to: string): number | null {
  if (!Number.isFinite(amount)) return null;
  const f = lookup(from);
  const t = lookup(to);
  if (f.family !== t.family) return null;
  if (t.perBase === 0) return null;
  return (amount * f.perBase) / t.perBase;
}

/** 사람이 읽는 계열 이름. 오류 문구에 쓴다 */
export function familyLabel(unit: string): string {
  const f = lookup(unit).family;
  if (f === "weight") return "무게";
  if (f === "volume") return "부피";
  return `'${unit.trim()}' 단위`;
}

/** 입력 도움말용 — 자주 쓰는 단위 */
export const COMMON_UNITS = ["g", "kg", "ml", "L", "개", "장", "팩", "봉"];
