import type { Recipe } from "./types";
import { newUuid } from "./store.ts";

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

/**
 * ★ 2026-09-18 — **뒤가 uuid 다.**
 *
 *   전에는 `my-a1b2c3d4` 였는데, 서버의 id 칸은 전부 uuid 라 **한 줄도 안
 *   올라갔다.** 아무 오류도 안 뜬다 — 직원(9/16)·거래처(9/17)에서 이미 두 번
 *   당한 것과 같은 함정이고 이게 세 번째다.
 *
 *   `my-` 접두사는 그대로 둔다. 그게 «내가 추가한 것» 을 가리는 표시이고
 *   (`isLocal`), 접두사만 떼면 그대로 서버 id 가 된다 — 되돌리기도 된다.
 */
export function newLocalId(): string {
  return LOCAL_PREFIX + newUuid();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 서버에 보낼 수 있는 꼴인가 — 옛 레시피는 아니다 */
export function serverReady(r: Recipe): boolean {
  if (!UUID.test(r.id.slice(LOCAL_PREFIX.length))) return false;
  return r.sections.every(
    (sec) => UUID.test(sec.id) && sec.steps.every((st) => UUID.test(st.id)),
  );
}

/** 옛 꼴이 하나라도 있나 */
export function needsRecipeIdMigration(list: Recipe[]): boolean {
  return list.some((r) => !serverReady(r));
}

/**
 * 옛 id 를 uuid 로 옮긴다. **사장님이 다시 입력할 일은 없어야 한다.**
 *
 * ★ 레시피·섹션·스텝 셋 다 바꾼다. 스텝 id 는 사진 파일 이름의 앞부분이라
 *   (`MediaSlot`) 바꾸면 이미 넣어둔 사진과 이름이 어긋난다 — 그래서
 *   **이미 uuid 인 것은 건드리지 않는다.** 옛 레시피에 사진이 붙어 있을
 *   가능성은 낮지만(추가 화면에 사진 칸이 없다) 그래도 규칙은 지킨다.
 */
export function migrateRecipeIds(list: Recipe[]): Recipe[] {
  return list.map((r) => {
    if (serverReady(r)) return r;
    const rid = UUID.test(r.id.slice(LOCAL_PREFIX.length))
      ? r.id
      : LOCAL_PREFIX + newUuid();
    return {
      ...r,
      id: rid,
      sections: r.sections.map((sec) => ({
        ...sec,
        id: UUID.test(sec.id) ? sec.id : newUuid(),
        steps: sec.steps.map((st) => ({
          ...st,
          id: UUID.test(st.id) ? st.id : newUuid(),
        })),
      })),
    };
  });
}
