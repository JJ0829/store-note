import type { Recipe } from "./types";

/* ------------------------------------------------------------------ *
 * 매장에서 직접 추가한 레시피.
 *
 * 카페·베이커리는 메뉴가 수십 개다. 시드 파일에 미리 다 넣어둘 수 없고,
 * 사장님이 그때그때 추가할 수 있어야 한다.
 *
 * 지금은 이 태블릿(브라우저)에만 저장된다. 서버 DB(Supabase)는 배포 직전
 * 작업으로 잡혀 있다. 그때까지 작업분이 날아가지 않도록 "내보내기"로
 * JSON을 빼낼 수 있게 해둔다.
 * ------------------------------------------------------------------ */

const KEY = "sop:recipes";

/**
 * 읽을 수 있는 레시피인가.
 *
 * ★ 왜 검사하는가 — **하나가 깨지면 레시피 화면 전체가 하얘졌다.**
 *   `Array.isArray` 만 보고 통과시켜서, 모양이 다른 항목이 하나라도 있으면
 *   화면이 `recipe.ingredients.length` 에서 터졌다. 사장님이 보는 것은
 *   `Application error: a client-side exception has occurred` 한 줄뿐이다.
 *   (2026-09-10 브라우저에서 실제로 냈다)
 *
 *   어떻게 깨지나 —
 *     · 옛 판 앱이 만든 것 (칸 이름이 달랐다)
 *     · 다른 판에서 만든 백업으로 되돌렸을 때
 *     · 저장 공간이 차서 새 값이 안 써지고 옛 값이 남았을 때
 *
 *   **한 개가 깨졌다고 나머지까지 못 보게 하지 않는다.** 깨진 것만 빼고
 *   나머지를 보여주고, 몇 개를 뺐는지는 `countBrokenLocalRecipes` 로 알린다.
 */
function isReadable(r: unknown): r is Recipe {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.length > 0;
  return (
    str(x.id) &&
    str(x.slug) &&
    str(x.name) &&
    Array.isArray(x.ingredients) &&
    Array.isArray(x.sections) &&
    typeof x.yield === "object" &&
    x.yield !== null &&
    typeof (x.yield as Record<string, unknown>).amount === "number"
  );
}

/** 저장된 것을 통째로 읽는다 (검사 전). 아래 두 함수만 쓴다 */
function rawList(): unknown[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadLocalRecipes(): Recipe[] {
  return rawList().filter(isReadable);
}

/**
 * 읽을 수 없어서 화면에서 뺀 개수.
 *
 * 0 이 아니면 화면이 말해야 한다 — 조용히 빼면 사장님은 **자기가 넣은
 * 레시피가 사라진 줄** 안다. 그리고 그게 백업에서도 빠진다는 뜻이다.
 */
export function countBrokenLocalRecipes(): number {
  return rawList().filter((r) => !isReadable(r)).length;
}

export function saveLocalRecipes(list: Recipe[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    // 저장 공간이 꽉 찼거나 사생활 보호 모드
    return false;
  }
}

export function addLocalRecipe(recipe: Recipe): boolean {
  const list = loadLocalRecipes();
  return saveLocalRecipes([...list, recipe]);
}

export function removeLocalRecipe(id: string): boolean {
  return saveLocalRecipes(loadLocalRecipes().filter((r) => r.id !== id));
}

export function getLocalRecipe(id: string): Recipe | null {
  return loadLocalRecipes().find((r) => r.id === id) ?? null;
}

/** 직접 추가한 것인지 구분. 시드 레시피는 이 접두사가 없다. */
export const LOCAL_PREFIX = "my-";

export function isLocal(recipe: Recipe): boolean {
  return recipe.id.startsWith(LOCAL_PREFIX);
}

export function newLocalId(): string {
  return LOCAL_PREFIX + Math.random().toString(36).slice(2, 10);
}
