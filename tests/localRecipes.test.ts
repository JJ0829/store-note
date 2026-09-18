/* ------------------------------------------------------------------ *
 * 매장에서 직접 추가한 레시피.
 *
 * ★ 여기서 지킬 것은 `my-` 접두사 하나다.
 *   시드 레시피(`data/seed.json`)와 직접 추가분이 **같은 목록에 섞여** 화면에
 *   나온다(`/r` 의 `[...DATA.recipes, ...myRecipes()]`). 접두사가 규약대로
 *   붙지 않으면 ⓐ 편집·삭제가 시드 레시피에 걸리거나 ⓑ id 가 겹쳐
 *   조회가 엉뚱한 것을 집는다. 시드는 읽기 전용이라 되돌릴 방법이 없다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import type { Recipe } from "../src/lib/types.ts";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

const local = new MemStorage();
(globalThis as Record<string, unknown>).localStorage = local;

const {
  countBrokenLocalRecipes,
  LOCAL_PREFIX,
  addLocalRecipe,
  getLocalRecipe,
  isLocal,
  loadLocalRecipes,
  newLocalId,
  removeLocalRecipe,
  saveLocalRecipes,
} = await import("../src/lib/localRecipes.ts");

const KEY = "sop:recipes";

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "my-abc1234",
    slug: "vanilla-latte",
    name: "바닐라라떼",
    category: "음료",
    yield: { amount: 1, unit: "잔" },
    forNewbie: false,
    sections: [],
    ingredients: [],
    ...over,
  } as Recipe;
}

/* ---------- 읽기 방어 ---------- */

test("저장된 게 없으면 빈 배열", () => {
  local.clear();
  assert.deepEqual(loadLocalRecipes(), []);
});

test("깨진 JSON 이 들어 있어도 화면이 죽지 않는다", () => {
  local.clear();
  local.setItem(KEY, "{이건 JSON이 아니다");
  assert.deepEqual(loadLocalRecipes(), []);
});

test("배열이 아닌 값이 저장돼 있어도 빈 배열", () => {
  for (const bad of ['{"a":1}', '"문자열"', "5", "null"]) {
    local.clear();
    local.setItem(KEY, bad);
    assert.deepEqual(loadLocalRecipes(), [], `실패한 입력: ${bad}`);
  }
});

/* ---------- 추가 · 삭제 ---------- */

test("추가하면 읽힌다", () => {
  local.clear();
  assert.equal(addLocalRecipe(recipe()), true);
  const list = loadLocalRecipes();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "바닐라라떼");
});

test("추가가 기존 것을 지우지 않는다", () => {
  local.clear();
  addLocalRecipe(recipe({ id: "my-1111111", name: "첫째" }));
  addLocalRecipe(recipe({ id: "my-2222222", name: "둘째" }));
  assert.deepEqual(
    loadLocalRecipes().map((r) => r.name),
    ["첫째", "둘째"],
  );
});

test("추가 순서를 지킨다 (화면 정렬을 여기에 맡긴다)", () => {
  local.clear();
  for (const n of ["가", "나", "다"]) addLocalRecipe(recipe({ id: "my-" + n, name: n }));
  assert.deepEqual(
    loadLocalRecipes().map((r) => r.name),
    ["가", "나", "다"],
  );
});

test("삭제는 그 id 만 지운다", () => {
  local.clear();
  addLocalRecipe(recipe({ id: "my-1111111", name: "남길 것" }));
  addLocalRecipe(recipe({ id: "my-2222222", name: "지울 것" }));
  removeLocalRecipe("my-2222222");
  assert.deepEqual(
    loadLocalRecipes().map((r) => r.name),
    ["남길 것"],
  );
});

test("없는 id 를 지우면 목록이 그대로다 (예외 아님)", () => {
  local.clear();
  addLocalRecipe(recipe({ id: "my-1111111" }));
  assert.equal(removeLocalRecipe("my-없는것"), true);
  assert.equal(loadLocalRecipes().length, 1);
});

test("같은 id 를 두 번 추가하면 둘 다 들어간다 (알려진 한계)", () => {
  // 중복을 막지 않는다. 화면이 `newLocalId()` 로 매번 새 id 를 만들므로
  // 실제 경로에서는 안 겹치지만, 백업을 손으로 합치면 겹칠 수 있다.
  local.clear();
  addLocalRecipe(recipe({ id: "my-same" }));
  addLocalRecipe(recipe({ id: "my-same" }));
  assert.equal(loadLocalRecipes().length, 2);
  // 그리고 삭제하면 둘 다 사라진다
  removeLocalRecipe("my-same");
  assert.equal(loadLocalRecipes().length, 0);
});

/* ---------- 하나 조회 ---------- */

test("id 로 하나를 찾는다", () => {
  local.clear();
  addLocalRecipe(recipe({ id: "my-target", name: "찾을 것" }));
  assert.equal(getLocalRecipe("my-target")?.name, "찾을 것");
});

test("없는 id 는 null (404 로 이어진다)", () => {
  local.clear();
  assert.equal(getLocalRecipe("my-없음"), null);
});

/* ---------- ★ 접두사 규약 ---------- */

test("★ 접두사는 my- 다", () => {
  assert.equal(LOCAL_PREFIX, "my-");
});

test("★ 직접 추가분만 isLocal 이 참이다", () => {
  assert.equal(isLocal(recipe({ id: "my-abc1234" })), true);
});

test("★ 시드 레시피는 isLocal 이 거짓 — 편집·삭제가 걸리면 안 된다", () => {
  // seed.json 의 실제 id 형태
  for (const id of ["r-1", "americano", "shokupan", "cold-brew"]) {
    assert.equal(isLocal(recipe({ id })), false, `시드 id 가 로컬로 잡혔다: ${id}`);
  }
});

test("이름 앞부분만 비슷한 id 는 로컬이 아니다", () => {
  assert.equal(isLocal(recipe({ id: "myrecipe" })), false);
  assert.equal(isLocal(recipe({ id: "m-1" })), false);
});

test("newLocalId 는 접두사로 시작한다", () => {
  assert.ok(newLocalId().startsWith(LOCAL_PREFIX));
});

test("newLocalId 는 그 자체로 isLocal 을 통과한다", () => {
  assert.equal(isLocal(recipe({ id: newLocalId() })), true);
});

test("newLocalId 는 매번 다르다 (100번 뽑아 중복 없음)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(newLocalId());
  assert.equal(seen.size, 100);
});

test("newLocalId 는 URL·파일명에 안전한 문자만 쓴다", () => {
  // ?id= 로 주소에 실린다 (`/r/my?id=...`)
  for (let i = 0; i < 30; i++) {
    assert.match(newLocalId(), /^my-[a-z0-9-]+$/);
  }
});

/* ---------- 저장 실패 ---------- */

test("저장에 실패하면 false — 예외를 던지지 않는다", () => {
  local.clear();
  const orig = local.setItem;
  local.setItem = () => {
    throw new Error("QuotaExceeded");
  };
  assert.equal(saveLocalRecipes([recipe()]), false);
  assert.equal(addLocalRecipe(recipe()), false);
  local.setItem = orig;
});

/* ------------------------------------------------------------------ *
 * ★ 깨진 레시피 하나가 화면 전체를 죽이지 않는다.
 *
 * 2026-09-10 브라우저에서 실제로 냈다. 칸 이름이 다른 항목을 하나 넣었더니
 * `/r` 이 `Cannot read properties of undefined (reading 'length')` 로 터졌고,
 * 사장님이 보는 것은 `Application error` 한 줄뿐이었다.
 *
 * 예전 `loadLocalRecipes` 는 `Array.isArray(parsed)` 만 봤다 — 배열이기만
 * 하면 안에 뭐가 들었든 그대로 화면에 넘겼다.
 *
 * 어떻게 깨지나: 옛 판 앱이 만든 것 · 다른 판 백업으로 되돌렸을 때 ·
 * 저장 공간이 차서 새 값이 안 써지고 옛 값이 남았을 때.
 * ------------------------------------------------------------------ */

/** 화면이 실제로 읽는 칸을 다 갖춘 레시피 */
function whole(id: string): Recipe {
  return {
    id,
    slug: id,
    name: "우리집 스콘",
    category: "베이커리",
    yield: { amount: 6, unit: "개" },
    ingredients: [],
    sections: [],
    forNewbie: false,
  };
}

test("★ 깨진 항목만 빼고 나머지는 그대로 보여준다", () => {
  local.clear();
  local.setItem(
    "sop:recipes",
    JSON.stringify([
      whole("my-1"),
      // 옛 판이 만든 모양 — ingredients 대신 items, yield 가 문자열
      { id: "my-2", slug: "my-2", name: "옛날 것", yield: "6개", items: [] },
      whole("my-3"),
    ]),
  );

  const list = loadLocalRecipes();
  assert.deepEqual(
    list.map((r) => r.id),
    ["my-1", "my-3"],
    "성한 것까지 같이 사라졌거나, 깨진 것이 그대로 넘어갔다",
  );
  assert.equal(countBrokenLocalRecipes(), 1);
});

test("★ 뺀 개수를 셀 수 있다 (조용히 빼면 사장님은 자기가 지운 줄 안다)", () => {
  local.clear();
  local.setItem("sop:recipes", JSON.stringify([{ id: "x" }, null, "글자", 42]));
  assert.deepEqual(loadLocalRecipes(), []);
  assert.equal(countBrokenLocalRecipes(), 4);
});

test("성한 것만 있으면 뺀 개수가 0 이다", () => {
  local.clear();
  local.setItem("sop:recipes", JSON.stringify([whole("my-1")]));
  assert.equal(countBrokenLocalRecipes(), 0);
});

test("저장된 게 없으면 0 이다 (없는 것과 깨진 것은 다르다)", () => {
  local.clear();
  assert.equal(countBrokenLocalRecipes(), 0);
  assert.deepEqual(loadLocalRecipes(), []);
});

test("배열이 아닌 것이 들어 있어도 안 죽는다", () => {
  local.clear();
  local.setItem("sop:recipes", JSON.stringify({ not: "an array" }));
  assert.deepEqual(loadLocalRecipes(), []);
  assert.equal(countBrokenLocalRecipes(), 0);
});
