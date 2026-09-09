/* ------------------------------------------------------------------ *
 * 시드 무결성.
 *
 * 계산 버그가 아니라 데이터 오타를 잡는 테스트다. 지금 DB는 seed.json
 * 파일 하나고, 링크는 전부 slug 문자열로 연결돼 있다. 오타 하나면
 * 홈 화면 버튼이 404로 간다. 그리고 그건 화면을 눌러보기 전에는 모른다.
 *
 * 2026-09-18 심사 시연 중 링크 하나가 404 나는 사고를 막는 유일한 자동 검사다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  countCritical,
  countTasks,
  getPositionBySlug,
  getPrepListBySlug,
  getRecipeBySlug,
  getStore,
  irreversibleTasks,
  listPositions,
  listPrepLists,
  listRecipes,
  listShifts,
} from "../src/lib/repo.ts";

test("매장 정보가 있다", () => {
  const s = getStore();
  assert.ok(s.name.length > 0);
  assert.ok(s.slug.length > 0);
});

test("포지션·레시피·프렙·근무조가 비어 있지 않다", () => {
  assert.ok(listPositions().length > 0);
  assert.ok(listRecipes().length > 0);
  assert.ok(listPrepLists().length > 0);
  assert.ok(listShifts().length > 0);
});

test("id와 slug에 중복이 없다", () => {
  const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
  assert.deepEqual(dup(listPositions().map((p) => p.id)), []);
  assert.deepEqual(dup(listPositions().map((p) => p.shareSlug)), []);
  assert.deepEqual(dup(listRecipes().map((r) => r.id)), []);
  assert.deepEqual(dup(listRecipes().map((r) => r.slug)), []);
  assert.deepEqual(dup(listPrepLists().map((p) => p.slug)), []);
  assert.deepEqual(
    dup(listPrepLists().flatMap((p) => p.tasks.map((t) => t.id))),
    [],
  );
});

test("프렙이 가리키는 레시피가 실재한다", () => {
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      if (!t.recipeSlug) continue;
      assert.ok(
        getRecipeBySlug(t.recipeSlug),
        `${list.slug}/${t.id} → 없는 레시피 '${t.recipeSlug}'`,
      );
    }
  }
});

test("근무조가 띄우는 화면이 전부 실재한다 (홈 버튼 → 404 방지)", () => {
  for (const sh of listShifts()) {
    assert.ok(sh.focus.length > 0, `${sh.name}: 띄울 화면이 없다`);
    for (const f of sh.focus) {
      if (f.kind === "recipes") continue; // slug가 없는 종류
      const found =
        f.kind === "prep"
          ? getPrepListBySlug(f.slug)
          : getPositionBySlug(f.slug); // training / checklist
      assert.ok(found, `${sh.name}: ${f.kind} '${f.slug}' 없음`);
    }
  }
});

test("리드타임 종류와 실제 값이 어긋나지 않는다", () => {
  // kind만 보고 화면이 문구를 고르므로 여기가 어긋나면 계산이 통째로 안 뜬다
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      const where = `${list.slug}/${t.id}`;
      if (t.kind === "time") {
        assert.notEqual(t.leadTimeHours, null, `${where}: 시간이 비었다`);
      }
      if (t.kind === "order") {
        assert.notEqual(t.leadTimeDays, null, `${where}: 일수가 비었다`);
      }
      if (t.kind === "routine") {
        // 리드타임이 없는 일(홀 정리·화장실 청소)이다. 값이 들어 있으면
        // 화면이 "몇 시부터 쓸 수 있음"을 계산해서 없는 약속을 만든다
        assert.equal(t.leadTimeHours, null, `${where}: routine 인데 시간이 있다`);
        assert.equal(t.leadTimeDays, null, `${where}: routine 인데 일수가 있다`);
      }
      if (t.leadTimeHours !== null) {
        assert.ok(t.leadTimeHours > 0, `${where}: 리드타임이 0 이하`);
      }
    }
  }
});

test("되돌릴 수 없는 항목에는 결과 문장이 반드시 있다", () => {
  // 화면이 이 문장을 빨간 글씨로 그대로 띄운다. 비면 경고가 빈칸이 된다
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      if (t.recoverable) continue;
      assert.ok(
        t.consequence.trim().length > 0,
        `${list.slug}/${t.id}: consequence 없음`,
      );
    }
  }
});

test("task.id는 그대로 파일 이름이 되므로 안전한 문자만 쓴다", () => {
  // MediaSlot이 base={task.id} 로 `p-1-good.jpg` 같은 이름을 만든다.
  // 공백·한글·대문자가 섞이면 사장님이 넣은 파일과 이름이 안 맞는다
  const safe = /^[a-z0-9-]+$/;
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      assert.match(t.id, safe, `${list.slug}/${t.id}: 파일명으로 못 쓴다`);
    }
  }
  for (const p of listPositions()) {
    assert.match(p.shareSlug, safe, `${p.shareSlug}: 링크로 못 쓴다`);
    for (const s of p.sections) {
      for (const step of s.steps) {
        assert.match(step.id, safe, `${p.shareSlug}/${step.id}`);
      }
    }
  }
});

test("레시피에 배수 계산이 가능한 수량이 들어 있다", () => {
  for (const r of listRecipes()) {
    assert.ok(r.yield.amount > 0, `${r.slug}: 1배합 수량이 없다`);
    assert.ok(r.ingredients.length > 0, `${r.slug}: 재료가 없다`);
    for (const i of r.ingredients) {
      assert.equal(
        typeof i.amount,
        "number",
        `${r.slug}/${i.name}: 수량이 숫자가 아니다`,
      );
      assert.ok(
        Number.isFinite(i.amount),
        `${r.slug}/${i.name}: 수량이 숫자가 아니다`,
      );
    }
  }
});

test("근무조 시각은 HH:MM 형식이다", () => {
  for (const sh of listShifts()) {
    assert.match(sh.start, /^\d{2}:\d{2}$/, `${sh.name} 시작`);
    assert.match(sh.end, /^\d{2}:\d{2}$/, `${sh.name} 종료`);
  }
});

/* ------------------------------------------------------------------ */
/* repo의 집계 함수 — 홈 화면 숫자                                      */
/* ------------------------------------------------------------------ */

test("countTasks / countCritical: 섹션을 가로질러 센다", () => {
  for (const p of listPositions()) {
    const manual = p.sections.reduce((n, s) => n + s.steps.length, 0);
    assert.equal(countTasks(p), manual, `${p.shareSlug} 항목 수`);
    assert.ok(countTasks(p) > 0, `${p.shareSlug}: 항목이 없다`);
    assert.ok(
      countCritical(p) <= countTasks(p),
      `${p.shareSlug}: 필수가 전체보다 많다`,
    );
  }
});

test("irreversibleTasks: recoverable:false 만 골라낸다", () => {
  // 이 목록이 화면에서 빨간 경고가 된다. 전부 빨갛게 뜨면 사람은 무시한다
  for (const list of listPrepLists()) {
    const picked = irreversibleTasks(list);
    assert.ok(
      picked.every((t) => t.recoverable === false),
      `${list.slug}: 되돌릴 수 있는 항목이 섞였다`,
    );
    assert.equal(
      picked.length,
      list.tasks.filter((t) => !t.recoverable).length,
    );
  }
});

test("오후 프렙에는 되돌릴 수 없는 항목이 실제로 들어 있다", () => {
  // 이게 0이면 제품이 종이를 이기는 지점이 화면에서 사라진다
  const afternoon = getPrepListBySlug("afternoon");
  assert.ok(afternoon, "오후 프렙 목록이 없다");
  assert.ok(irreversibleTasks(afternoon).length > 0);
});

test("없는 slug를 물으면 null (404로 이어진다)", () => {
  assert.equal(getPositionBySlug("없는-포지션"), null);
  assert.equal(getRecipeBySlug("없는-레시피"), null);
  assert.equal(getPrepListBySlug("없는-프렙"), null);
});

test("★ 19:00~22:00 마감 준비 구간에 열 화면이 있다", () => {
  // day-flow 검수에서 나온 구멍(2026-09-09). 영업 종료 전 3시간 동안
  // 마감조가 여는 화면이 없었다 — cafe-close 체크리스트는 22시 이후 것이다
  const evening = getPrepListBySlug("evening");
  assert.ok(evening, "마감 준비 목록이 없다");
  assert.ok(evening.tasks.length > 0, "마감 준비 목록이 비었다");
  for (const t of evening.tasks) {
    assert.equal(t.trigger.type, "daily", `${t.id}: 매일 뜨는 일이 아니다`);
    assert.equal(
      (t.trigger as { at: string }).at,
      "19:00",
      `${t.id}: 19:00 이 아니다`,
    );
  }

  const close = listShifts().find((s) => s.name === "마감조");
  assert.ok(close, "마감조가 없다");
  assert.ok(
    close.focus.some((f) => f.kind === "prep" && f.slug === "evening"),
    "마감조 화면에 마감 준비가 안 걸려 있다 — 만들어놓고 아무도 못 연다",
  );
});
