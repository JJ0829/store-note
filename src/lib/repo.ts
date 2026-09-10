import fs from "node:fs";
import path from "node:path";
import type {
  Position,
  PrepList,
  PrepTask,
  Recipe,
  Shift,
  SeedData,
  Store,
} from "./types";

/**
 * 지금은 data/seed.json 파일 하나가 DB 역할을 한다.
 *
 * 2단계에서 Supabase로 옮길 때는 이 파일 안의 함수 본문만
 * 쿼리로 바꾸면 되고, 페이지·컴포넌트 코드는 손댈 필요가 없다.
 */

let cache: SeedData | null = null;

function load(): SeedData {
  // 개발 중에는 seed.json을 고칠 때마다 바로 반영되도록 캐시하지 않는다.
  if (cache && process.env.NODE_ENV === "production") return cache;

  const file = path.join(process.cwd(), "data", "seed.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as SeedData;
  cache = parsed;
  return parsed;
}

export function getStore(): Store {
  return load().store;
}

export function listPositions(): Position[] {
  return load().positions;
}

export function getPositionBySlug(slug: string): Position | null {
  return load().positions.find((p) => p.shareSlug === slug) ?? null;
}

export function countTasks(position: Position): number {
  return position.sections.reduce((sum, s) => sum + s.steps.length, 0);
}

/**
 * 프렙 목록에서 **진행률에 세는 항목 수**.
 *
 * ★ 홈과 프렙 화면이 **같은 값**을 써야 한다 (2026-09-10).
 *   `list.tasks.length` 를 그대로 쓰면 홈은 "11개" 인데 들어가면 "0/5" 다.
 *   숫자가 어긋나면 사람은 둘 다 안 믿는다.
 *
 * 규칙은 `PrepView` 와 같다 —
 *   묶음 머리(자식이 `optional` 아닌 카드)는 할 일이 아니라 이름표라 안 세고,
 *   옵션(매장에 따라 안 하는 것)도 안 센다.
 * → `src/lib/types.ts` 의 `optionOf` / `optional` 주석
 */
export function countedTasks(list: PrepList): number {
  const kids = new Map<string, PrepTask[]>();
  for (const t of list.tasks) {
    if (!t.optionOf) continue;
    const cur = kids.get(t.optionOf);
    if (cur) cur.push(t);
    else kids.set(t.optionOf, [t]);
  }
  const isHeader = (id: string) => (kids.get(id) ?? []).some((k) => !k.optional);
  return list.tasks.filter((t) => (t.optionOf ? !t.optional : !isHeader(t.id))).length;
}

export function countCritical(position: Position): number {
  return position.sections.reduce(
    (sum, s) => sum + s.steps.filter((t) => t.critical).length,
    0,
  );
}

/* ------------------------------------------------------------------ */
/* 레시피 · 프렙 (데이터 모델 v2에서 추가)                              */
/* ------------------------------------------------------------------ */

export function listRecipes(): Recipe[] {
  return load().recipes ?? [];
}

export function getRecipeBySlug(slug: string): Recipe | null {
  return listRecipes().find((r) => r.slug === slug) ?? null;
}

export function listPrepLists(): PrepList[] {
  return load().prepLists ?? [];
}

export function getPrepListBySlug(slug: string): PrepList | null {
  return listPrepLists().find((p) => p.slug === slug) ?? null;
}

/**
 * 되돌릴 수 없는 항목만 골라낸다.
 *
 * 이 제품이 종이를 이기는 지점이 정확히 여기다 — 발주는 깜빡해도 쿠팡으로
 * 메우지만, 어제 안 걸어둔 콜드브루는 어떤 방법으로도 못 만든다.
 * 전부 빨간 불로 띄우면 사람은 무시하므로, 경고는 이 목록에만 준다.
 */
export function irreversibleTasks(list: PrepList): PrepTask[] {
  return list.tasks.filter((t) => !t.recoverable);
}

/* ------------------------------------------------------------------ */
/* 근무 스케줄                                                          */
/* ------------------------------------------------------------------ */

export function listShifts(): Shift[] {
  return load().shifts ?? [];
}
