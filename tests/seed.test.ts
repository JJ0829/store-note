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
  countedTasks,
  filmableTasks,
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
import type { PrepTask } from "../src/lib/types.ts";

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
  /* day-flow 검수에서 나온 구멍(2026-09-09). 영업 종료 전 3시간 동안
     마감조가 여는 화면이 없었다 — 마감 체크리스트는 22시 이후 것이었다.

     ★ 2026-09-13 — 그 구멍을 **별도 프렙 목록(`evening`)이 아니라
       마감 체크리스트 안의 한 섹션**으로 메운다 (사장님 지적:
       *"마감준비나 체크리스트나 거기서 거기지"*).

       실제로 둘은 같은 사람이 이어서 하는 한 흐름이고, 화면이 둘로
       나뉘면 마감조가 뭘 눌러야 할지 고르게 된다. 다만 **19시라는 시각은
       버리면 안 된다** — 그게 이 구멍의 내용 전부다. 그래서 섹션 제목과
       안내 문구에 남기고, 하는 순서대로 맨 앞에 둔다. */
  const close = listPositions().find((p) => p.shareSlug === "cafe-close");
  assert.ok(close, "마감 체크리스트가 없다");

  const hall = close.sections.find((sec) => sec.title.includes("19시"));
  assert.ok(hall, "19시부터 하는 구간이 마감 체크리스트에 없다 — 그 3시간이 다시 빈다");
  assert.ok(hall.steps.length > 0, "19시 구간이 비었다");
  assert.ok(
    hall.note && hall.note.includes("19"),
    "19시라는 시각이 화면 문구에 없다 — 제목만으로는 왜 미리 하는지 모른다",
  );
  assert.equal(close.sections[0].id, hall.id, "19시 구간이 맨 앞에 없다 — 하는 순서와 다르다");

  const closeShift = listShifts().find((s) => s.name === "마감조");
  assert.ok(closeShift, "마감조가 없다");
  assert.ok(
    closeShift.focus.some((f) => f.kind === "checklist" && f.slug === "cafe-close"),
    "마감조 화면에 마감 체크리스트가 안 걸려 있다 — 만들어놓고 아무도 못 연다",
  );
  assert.ok(
    !closeShift.focus.some((f) => f.kind === "prep" && f.slug === "evening"),
    "없어진 목록(evening)이 마감조 화면에 아직 걸려 있다",
  );
  assert.equal(getPrepListBySlug("evening"), null, "evening 목록이 아직 남아 있다");
});

test("★ 추가 옵션(optionOf)은 같은 목록의 실재하는 항목을 가리킨다", () => {
  // 부모를 못 찾으면 그 항목이 화면에서 통째로 사라진다 —
  // 부모 카드 안에만 그려지고, 목록 순회는 부모만 돌기 때문이다
  for (const list of listPrepLists()) {
    const ids = new Set(list.tasks.map((t) => t.id));
    for (const t of list.tasks) {
      if (!t.optionOf) continue;
      assert.ok(
        ids.has(t.optionOf),
        `${list.slug}/${t.id}: 부모 '${t.optionOf}' 가 이 목록에 없다`,
      );
      assert.notEqual(t.optionOf, t.id, `${list.slug}/${t.id}: 자기 자신을 가리킨다`);
    }
  }
});

test("★ 옵션의 옵션은 없다 — 한 겹만이다", () => {
  // 두 겹이 되면 화면이 손자를 아무데도 안 그린다
  for (const list of listPrepLists()) {
    const optionIds = new Set(list.tasks.filter((t) => t.optionOf).map((t) => t.id));
    for (const t of list.tasks) {
      if (!t.optionOf) continue;
      assert.ok(
        !optionIds.has(t.optionOf),
        `${list.slug}/${t.id}: 부모 '${t.optionOf}' 도 옵션이다 (두 겹)`,
      );
    }
  }
});

test("★ 진행률 분모는 부모 항목 수다 — 옵션은 빠진다", () => {
  // 매장마다 안 하는 일(르방)이 분모에 들어가면 9/10 이 영영 안 채워지고
  // 진행률이 거짓이 된다. 그게 optionOf 를 만든 이유다
  const af = getPrepListBySlug("afternoon");
  assert.ok(af);
  const tops = af.tasks.filter((t) => !t.optionOf);
  assert.ok(
    tops.length < af.tasks.length,
    "오후 프렙에 옵션이 하나도 없다 — 르방이 부모 항목으로 돌아갔나",
  );
  const levain = af.tasks.find((t) => t.title.includes("르방"));
  assert.ok(levain, "르방 항목이 없다");
  assert.equal(levain.optionOf, "p-2", "르방이 '내일용 반죽' 에 안 붙어 있다");
});

test("★ 되돌릴 수 없는 안내는 옵션까지 센다", () => {
  // 진행률과 분모가 다른 것은 일부러다. 르방을 쓰는 매장에서
  // "다 했습니다" 가 거짓이 되면 안 된다
  const af = getPrepListBySlug("afternoon");
  assert.ok(af);
  const keep = af.tasks.filter((t) => !t.recoverable);
  assert.ok(
    keep.some((t) => t.optionOf !== null),
    "되돌릴 수 없는 옵션이 하나도 없다 — 이 테스트가 지키려는 경우가 사라졌다",
  );
});

test("★ 매장마다 다른 바 부재료는 한 카드에 모여 있다", () => {
  // 사장님 지적 2026-09-09: "따로말고 한곳에 모아서 해줘"
  // 청·냉침차·밀크티·시럽·크림폼이 각각 카드를 차지하면 목록이 열 칸이 되고,
  // 그중 대부분은 "남아 있으니 넘어감" 이라 진행률이 의미를 잃는다
  const af = getPrepListBySlug("afternoon");
  assert.ok(af);
  const bar = af.tasks.find((t) => t.id === "p-bar");
  assert.ok(bar, "바 부재료 부모 항목이 없다");
  assert.equal(bar.optionOf, null, "부모가 또 다른 옵션이 됐다");

  const kids = af.tasks.filter((t) => t.optionOf === "p-bar").map((t) => t.title);
  for (const want of ["에이드 청", "냉침차", "밀크티", "시럽", "크림폼"]) {
    assert.ok(
      kids.some((k) => k.includes(want)),
      `'${want}' 가 바 부재료 카드 밖에 있다`,
    );
  }

  // 카드는 다섯 개다 — 콜드브루 / 반죽 / 바 부재료 / 발주 2
  const tops = af.tasks.filter((t) => t.optionOf === null);
  assert.equal(tops.length, 5, `카드가 ${tops.length}개다 (5개여야 한다)`);
});

test("★ 옵션으로 내려도 되돌릴 수 없는 것은 안내에서 안 빠진다", () => {
  // 청·냉침차·밀크티는 옵션인데 recoverable:false 다.
  // 여기서 빠지면 "다 했습니다" 가 거짓이 된다
  const af = getPrepListBySlug("afternoon");
  assert.ok(af);
  const keepOptions = af.tasks.filter((t) => !t.recoverable && t.optionOf !== null);
  assert.ok(
    keepOptions.length >= 3,
    `되돌릴 수 없는 옵션이 ${keepOptions.length}개다 — 청·냉침차·밀크티가 사라졌나`,
  );
  // 전체 개수는 카드 수와 무관하게 유지된다
  assert.equal(af.tasks.filter((t) => !t.recoverable).length, 7);
});

/* ---------- 묶음(그룹)과 옵션은 다른 것이다 ---------- */

/** 진행률에 세는 것 = 묶음 머리가 아닌 카드 + optional 아닌 자식 */
function countedOf(list: { tasks: PrepTask[] }): PrepTask[] {
  const kidsBy = new Map<string, PrepTask[]>();
  for (const t of list.tasks) {
    if (!t.optionOf) continue;
    const cur = kidsBy.get(t.optionOf);
    if (cur) cur.push(t);
    else kidsBy.set(t.optionOf, [t]);
  }
  const isHeader = (id: string) => {
    const kids = kidsBy.get(id) ?? [];
    return kids.length > 0 && kids.some((k) => !k.optional);
  };
  return list.tasks.filter((t) => (t.optionOf ? !t.optional : !isHeader(t.id)));
}

test("★ optional 인 항목은 반드시 어느 카드 안에 들어가 있다", () => {
  // 분모에서 빠지면서 부모도 없으면 그 항목은 화면에 아무데도 안 그려진다
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      if (!t.optional) continue;
      assert.ok(t.optionOf, `${list.slug}/${t.id}: optional 인데 부모가 없다`);
    }
  }
});

test("★ 주기 점검은 세 묶음이고 항목 13개는 그대로다", () => {
  // 사장님 요청 2026-09-08: "주기 점검도 정리해줘"
  const cy = getPrepListBySlug("cycle");
  assert.ok(cy);
  const heads = cy.tasks.filter((t) => t.optionOf === null);
  assert.equal(heads.length, 3, `묶음이 ${heads.length}개다`);
  assert.deepEqual(
    heads.map((h) => h.title),
    ["기계 · 설비 점검", "안 보이는 곳 청소", "서류 · 법정"],
  );
  const kids = cy.tasks.filter((t) => t.optionOf !== null);
  assert.equal(kids.length, 13, "점검 항목이 13개가 아니다");
});

test("★★ 주기 점검 항목은 optional 이 아니다 — 매장 사정과 무관하다", () => {
  // 여기에 "매장에 따라 안 하기도 합니다" 를 붙이면 거짓이다.
  // 보건증·소방·위생교육은 안 하면 과태료다
  const cy = getPrepListBySlug("cycle");
  assert.ok(cy);
  for (const t of cy.tasks) {
    assert.equal(t.optional, false, `${t.id} (${t.title}) 가 optional 이다`);
  }
});

test("★★ 진행률 분모 — 묶음 머리는 안 세고 그 안의 항목을 센다", () => {
  const cy = getPrepListBySlug("cycle");
  assert.ok(cy);
  // 묶음 3 + 항목 13 = 16 이 아니라 13 이어야 한다. 부모까지 세면 두 번 세는 셈
  assert.equal(countedOf(cy).length, 13, "주기 점검 분모가 13이 아니다");

  const af = getPrepListBySlug("afternoon");
  assert.ok(af);
  // 바 부재료는 안에 든 게 전부 optional 이라 그 카드 자체가 할 일(점검했다)이다
  assert.equal(countedOf(af).length, 5, "오후 프렙 분모가 5가 아니다");

  /* 마감 준비(evening)는 2026-09-13 에 마감 체크리스트로 합쳐졌다.
     프렙에 남을 이유가 없었다 — 세 항목 다 `routine` 이라 기다릴 것이 없었다. */
});

test("★★ 주기 숫자를 시드에 박아두지 않는다 — 매장마다 다르다", () => {
  // 사장님 지적 2026-09-08: "제빙기 청소 1개월마다 체크도 지우지 — 더럽게.
  // 매일 청소하는 곳도 있는데. 6개월마다 이런 거도 쓰는 곳마다 다 달라서
  // 굳이 없어도 될 거 같은데"
  //
  // 제빙기를 매일 닦는 매장에 "1개월마다" 를 띄우면 그 화면은 처음부터
  // 틀린 말을 한다. 내가 모르는 숫자를 박아놓으면 사장님이 그걸 믿는다.
  const cy = getPrepListBySlug("cycle");
  assert.ok(cy);
  for (const t of cy.tasks) {
    if (t.trigger.type !== "cycle") continue;
    assert.equal(
      t.trigger.everyDays,
      null,
      `${t.id} (${t.title}): 주기 숫자가 시드에 박혀 있다`,
    );
  }
});

test("★ 리드타임이 있는 항목에는 \"안 하면\" 문장을 화면이 안 띄운다 — 시드도 비워둔다", () => {
  // 사장님 지적 2026-09-08: "안 하면 쿠팡으로 메울 수 있습니다 이딴
  // 안 해도 될 말은 왜 하냐. 그냥 만드는 데 드는 시간만 있어도 될 것 같은데"
  //
  // 화면이 안 띄우는 것과 별개로, **되돌릴 수 있는 데다 리드타임까지 있는**
  // 항목에 문장을 남겨두면 아무도 안 보는 글이 시드에 쌓인다.
  // 되돌릴 수 없는 것(recoverable:false)은 나중에 쓰일 수 있으니 그대로 둔다.
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      const hasLead = t.leadTimeHours !== null || t.leadTimeDays !== null;
      if (!hasLead || !t.recoverable) continue;
      assert.equal(
        t.consequence,
        "",
        `${list.slug}/${t.id} (${t.title}): 아무데도 안 뜨는 문장이 남아 있다`,
      );
    }
  }
});

test("★ 리드타임이 없는 항목에는 \"안 하면\" 문장이 있어야 한다", () => {
  // 주기 점검·홀 정리처럼 리드타임이 없는 일은 이 문장 말고
  // 왜 하는지 설명할 방법이 없다. 묶음 머리는 할 일이 아니라 예외다
  const heads = new Set(
    listPrepLists().flatMap((l) =>
      l.tasks.filter((t) => t.optionOf).map((t) => t.optionOf as string),
    ),
  );
  for (const list of listPrepLists()) {
    for (const t of list.tasks) {
      const hasLead = t.leadTimeHours !== null || t.leadTimeDays !== null;
      if (hasLead || heads.has(t.id)) continue;
      assert.notEqual(
        t.consequence.trim(),
        "",
        `${list.slug}/${t.id} (${t.title}): 왜 해야 하는지가 화면에 없다`,
      );
    }
  }
});

/* ------------------------------------------------------------------ *
 * ★ 숫자 정본
 *
 * 이 값들은 문서 아홉 곳에 적혀 있었고 시드를 고칠 때마다 전부 낡았다.
 * 2026-09-10 점검에서 28군데가 틀린 채로 남아 있는 것을 발견했다.
 *
 * **정본은 `docs/deliverables/21_화면명세.md` §1-b 한 곳이고, 이 테스트가 그것을 못 박는다.**
 * 시드를 일부러 고쳤다면 이 테스트가 깨지는 게 정상이다 —
 * **숫자를 여기서 고치고 §1-b 도 같이 고칠 것.** 그러라고 있는 테스트다.
 * ------------------------------------------------------------------ */

const 정본 = "docs/deliverables/21_화면명세.md §1-b 를 같이 고칠 것";

test("★ 숫자 정본 — 프렙 목록의 개수", () => {
  const want: Record<string, { all: number; counted: number; irreversible: number }> = {
    midday: { all: 6, counted: 6, irreversible: 0 },
    afternoon: { all: 11, counted: 5, irreversible: 7 },
    cycle: { all: 16, counted: 13, irreversible: 4 },
  };
  assert.equal(listPrepLists().length, 3, `프렙 목록 수가 바뀌었다 — ${정본}`);
  for (const list of listPrepLists()) {
    const w = want[list.slug];
    assert.ok(w, `모르는 프렙 목록 ${list.slug} — ${정본}`);
    assert.equal(list.tasks.length, w.all, `${list.slug} 전체 항목 — ${정본}`);
    assert.equal(countedTasks(list), w.counted, `${list.slug} 화면에 세는 수 — ${정본}`);
    assert.equal(
      irreversibleTasks(list).length,
      w.irreversible,
      `${list.slug} 되돌릴 수 없음 — ${정본}`,
    );
  }
});

test("★ 숫자 정본 — 레시피 · 포지션 · 근무조 · 촬영 대상", () => {
  assert.equal(listRecipes().length, 10, `레시피 수 — ${정본}`);
  assert.equal(listShifts().length, 4, `근무조 수 — ${정본}`);

  const positions = listPositions();
  assert.equal(positions.length, 3, `포지션 수 — ${정본}`);
  const positionSteps = positions.reduce((n, p) => n + countTasks(p), 0);
  assert.equal(positionSteps, 29, `포지션 스텝 합계 — ${정본}`);

  const recipeSteps = listRecipes().reduce(
    (n, r) => n + r.sections.reduce((m, s) => m + s.steps.length, 0),
    0,
  );
  assert.equal(recipeSteps, 32, `레시피 스텝 합계 — ${정본}`);

  const prepTasks = listPrepLists().reduce((n, l) => n + l.tasks.length, 0);
  assert.equal(prepTasks, 33, `프렙 항목 합계 — ${정본}`);

  /* ★ 촬영 대상은 프렙 **전체(30)가 아니라 묶을 머리를 뺀 27** 이다 (2026-09-12).
   *
   *   예전에는 `prepTasks` 를 그대로 더해 88 이라고 했는데, `/shoot` 도 `l.tasks` 를
   *   그대로 돌고 있어서 **둘 다 같이 틀렸고 그래서 테스트가 안 걸렸다.**
   *   「묶음 머리」는 `기계 · 설비 점검` 처럼 **이름표라 찍을 장면이 없다.**
   *   옵션은 반대로 찍을 수 있으므로 그대로 센다 — `repo.filmableTasks()` 참고.
   *
   *   여기서 그 함수를 그대로 쓰지 않고 따로 세는 이유: 함수가 틀리면 테스트도
   *   같이 틀려서 아무것도 못 잡는다. **시드에서 직접** 센다. */
  const heads = listPrepLists().flatMap((l) => {
    const kids = new Map<string, typeof l.tasks>();
    for (const t of l.tasks) {
      if (!t.optionOf) continue;
      const cur = kids.get(t.optionOf);
      if (cur) cur.push(t);
      else kids.set(t.optionOf, [t]);
    }
    return [...kids].filter(([, ks]) => ks.some((k) => !k.optional)).map(([id]) => id);
  });
  assert.equal(heads.length, 3, `묶음 머리 수 — ${정본}`);

  const filmable = listPrepLists().reduce((n, l) => n + filmableTasks(l).length, 0);
  assert.equal(filmable, prepTasks - heads.length, "filmableTasks 가 묶음 머리만 뺀다");

  // /shoot 이 실제로 만드는 목록과 같은 셈법이다 (src/app/shoot/page.tsx)
  assert.equal(positionSteps + recipeSteps + filmable, 91, `촬영 대상 합계 — ${정본}`);
});

test("★ 숫자 정본 — 레시피가 붙은 프렙 · 수량이 바뀌는 프렙", () => {
  const all = listPrepLists().flatMap((l) => l.tasks);
  assert.equal(all.filter((t) => t.recipeSlug).length, 8, `레시피가 붙은 프렙 — ${정본}`);
  assert.equal(all.filter((t) => t.quantityVaries).length, 9, `수량이 바뀌는 프렙 — ${정본}`);
});
