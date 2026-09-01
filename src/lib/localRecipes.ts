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

export function loadLocalRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Recipe[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
