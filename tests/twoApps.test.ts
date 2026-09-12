/* ------------------------------------------------------------------ *
 * 두 앱이 같은 사실을 보여주는가.
 *
 * 이 제품은 앱이 둘이다.
 *   · Next 앱 — `data/seed.json` 을 읽는다. 이게 제품이다
 *   · 단일 파일 — `presentation/*.html` 안에 시드를 **손으로 복사해 박아뒀다**
 *     (발표장에서 인터넷·개발환경이 없을 때의 마지막 수단)
 *
 * `presentation/README.md` 가 이미 경고하고 있다 —
 * **"원본을 고치면 이 파일도 같이 고쳐야 한다. 자동으로 따라가지 않는다."**
 * 그런데 안 고쳤을 때 알려주는 장치가 없었다. 시연 화면이 제품과 다른 숫자를
 * 보여줘도 아무도 모른다. **심사위원이 물어볼 숫자가 바로 그 숫자다.**
 *
 * ────────────────────────────────────────────────────────────────
 * ★ 여기서 맞추는 것은 **사실**이지 **모양**이 아니다.
 *
 *   단일 파일은 시드를 그대로 베낀 게 아니라 **납작하게 다시 쓴 것**이다.
 *   서버가 없으니 필드 이름을 짧게 쓰고, `trigger` 같은 것은 화면에 그대로
 *   찍을 문자열로 미리 만들어 둔다. 그건 갈라진 게 아니라 설계다.
 *
 *   그래서 아래 대응표(`FIELD_MAP`)로 짝을 지어 **값**만 비교한다.
 *   모양까지 같게 만들려 들면 단일 파일이 Next 앱의 복제본이 되어야 하는데,
 *   그러면 애초에 따로 둘 이유가 없다.
 *
 * ⚠️ 시드에 필드를 새로 만들면 **대응표에도 넣어야 한다.** 안 넣으면
 *   그 필드는 검사되지 않고, 두 앱이 갈려도 조용하다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SINGLE = path.join(process.cwd(), "presentation", "매장수첩.html");

/* ------------------------------------------------------------------ *
 * 박아둔 DATA 를 진짜 객체로 꺼낸다
 *
 * 정규식으로 긁으면 따옴표 안의 중괄호에서 무너진다. 그래서 괄호 짝을
 * 세어서 잘라내고 `vm` 으로 평가한다 — 실제로 브라우저가 읽는 그 값이다.
 * ------------------------------------------------------------------ */

type Prep = {
  slug: string;
  name: string;
  tasks: Record<string, unknown>[];
};
type Embedded = {
  store: { name: string };
  shifts: { id: string; name: string; start: string; end: string }[];
  positions: { slug: string; name: string }[];
  recipes: Record<string, unknown>[];
  prepLists: Prep[];
};

function embeddedData(): Embedded {
  const html = fs.readFileSync(SINGLE, "utf-8");
  const at = html.indexOf("const DATA = {");
  assert.ok(at > 0, "단일 파일에서 const DATA 를 못 찾았다");
  const open = html.indexOf("{", at);

  let depth = 0;
  let i = open;
  let inStr: string | null = null;
  let inLine = false;
  let inBlock = false;
  for (; i < html.length; i++) {
    const c = html[i];
    const n = html[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  assert.equal(depth, 0, "DATA 의 중괄호 짝이 안 맞는다");

  /* ★ 평가는 격리된 context 에서 하고(우리 전역을 안 건드리게), 결과는
     JSON 으로 한 번 돌려서 **이쪽 realm 의 객체**로 만든다.
     안 그러면 배열·객체의 prototype 이 달라서 `deepEqual` 이
     "same structure but not reference-equal" 로 떨어진다. */
  const raw: unknown = vm.runInNewContext(`(${html.slice(open, i + 1)})`);
  return JSON.parse(JSON.stringify(raw)) as Embedded;
}

type SeedShape = {
  store: { name: string };
  shifts: { id: string; name: string; start: string; end: string }[];
  positions: { shareSlug: string; name: string }[];
  recipes: {
    slug: string;
    name: string;
    yield: { amount: number; unit: string };
    ingredients: { name: string; amount: number; unit: string }[];
  }[];
  prepLists: { slug: string; name: string; tasks: Record<string, unknown>[] }[];
};

const seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "seed.json"), "utf-8"),
) as SeedShape;

const DATA = embeddedData();

/**
 * 시드 id → 단일 파일 id.
 *
 * 단일 파일의 프렙은 하이픈을 뺀 id 를 쓴다 (`p-1` → `p1`). 체크 저장 키가
 * 그 값이라 지금 와서 바꾸면 시연 기기의 오늘 체크가 어긋난다.
 * **다르다는 사실 자체를 여기 적어두는 것으로 대신한다.**
 * (교육·체크리스트 항목은 2026-09-10 에 시드와 같은 id 로 맞췄다)
 */
const flatId = (id: string | null | undefined): string | null =>
  id == null ? null : String(id).replace(/-/g, "");

/**
 * 시드 필드 → 단일 파일 필드.
 *
 * ★ 시드에 필드를 만들면 여기에도 넣을 것. 안 넣으면 검사에서 빠진다.
 *
 * 일부러 뺀 것 —
 *   `kind` `goodImage` `badImage` `videoUrl`  단일 파일에 사진·영상이 없다
 *   `trigger`  시드는 `{type,at}` 구조, 단일은 화면에 찍을 문자열("매일 14:00").
 *              뜻이 같은지는 사람이 봐야 한다. 아래 별도 테스트에서 형태만 본다
 */
const FIELD_MAP: [seed: string, single: string][] = [
  ["title", "title"],
  ["desc", "desc"],
  ["leadTimeHours", "hours"],
  ["leadTimeDays", "days"],
  ["recoverable", "recoverable"],
  ["consequence", "conseq"],
  ["quantityVaries", "varies"],
  ["critical", "critical"],
  ["recipeSlug", "recipe"],
  ["optional", "optional"],
  ["group", "group"], // 어느 자리에서 하는 일인가 (2026-09-12)
];

/* ------------------------------------------------------------------ *
 * 매장 · 근무조
 * ------------------------------------------------------------------ */

test("매장 이름이 같다", () => {
  assert.equal(DATA.store.name, seed.store.name);
});

test("★ 근무조 이름·시각이 같다", () => {
  /* 첫 화면이 "지금 근무 중" 을 이걸로 정한다. 갈리면 시연에서 **엉뚱한
     근무조가 떠 있고**, 그 아래 버튼도 다른 것이 뜬다. */
  const norm = (s: { id: string; name: string; start: string; end: string }) =>
    `${s.id} ${s.name} ${s.start}~${s.end}`;
  assert.deepEqual(
    DATA.shifts.map(norm).sort(),
    seed.shifts.map(norm).sort(),
  );
});

test("★ 포지션(체크리스트) 슬러그와 이름이 같다", () => {
  const d = DATA.positions.map((p) => `${p.slug} ${p.name}`).sort();
  const s = seed.positions.map((p) => `${p.shareSlug} ${p.name}`).sort();
  assert.deepEqual(d, s);
});

/* ------------------------------------------------------------------ *
 * 레시피 — 심사위원이 물어볼 숫자
 * ------------------------------------------------------------------ */

test("★ 레시피 재료·수량·단위가 같다", () => {
  /* 여기가 갈리면 시연에서 보여준 배합과 제품의 배합이 다르다.
     16년 경력으로 검수하실 숫자이기도 하다. */
  for (const s of seed.recipes) {
    const d = DATA.recipes.find((r) => r.slug === s.slug);
    assert.ok(d, `단일 파일에 레시피가 없다: ${s.slug}`);

    const line = (x: { name: string; amount: number; unit: string }) =>
      `${x.name} ${x.amount}${x.unit}`;
    assert.deepEqual(
      ((d.ingredients ?? []) as typeof s.ingredients).map(line),
      s.ingredients.map(line),
      `${s.slug} 의 재료가 갈렸다`,
    );
  }
});

test("★ 레시피 분량(1배합이 몇 개인가)이 같다", () => {
  /* 배수 계산의 기준이다. 갈리면 "9개 필요 → 1.5배" 가 두 앱에서 다르게 나온다 */
  for (const s of seed.recipes) {
    const d = DATA.recipes.find((r) => r.slug === s.slug);
    assert.ok(d);
    const dy = d.yield as { amount: number; unit: string };
    assert.equal(
      `${dy.amount}${dy.unit}`,
      `${s.yield.amount}${s.yield.unit}`,
      `${s.slug} 의 분량이 갈렸다`,
    );
  }
});

test("레시피 개수와 슬러그가 같다", () => {
  assert.deepEqual(
    DATA.recipes.map((r) => r.slug as string).sort(),
    seed.recipes.map((r) => r.slug).sort(),
  );
});

/* ------------------------------------------------------------------ *
 * 프렙 — 이 업종의 핵심
 * ------------------------------------------------------------------ */

test("★ 프렙 항목의 리드타임·되돌림 여부가 같다", () => {
  /* CLAUDE.md: "진짜 가치는 recoverable:false, 돈으로 되돌릴 수 없는 것이다.
     화면이 그것만 빨간 테두리로 띄운다."
     그 판정이 두 앱에서 다르면 **시연 화면의 빨간 테두리가 거짓말이 된다.** */
  const problems: string[] = [];

  for (const sl of seed.prepLists) {
    const dl = DATA.prepLists.find((l) => l.slug === sl.slug);
    if (!dl) {
      problems.push(`프렙 목록이 없다: ${sl.slug}`);
      continue;
    }
    for (const st of sl.tasks) {
      const dt = dl.tasks.find((t) => t.id === flatId(st.id as string));
      if (!dt) {
        problems.push(`항목이 없다: ${sl.slug}/${String(st.id)} (${String(st.title)})`);
        continue;
      }
      for (const [sk, dk] of FIELD_MAP) {
        const a = st[sk] ?? null;
        const b = dt[dk] ?? null;
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          problems.push(
            `${String(st.id)} · ${sk}→${dk}  시드=${JSON.stringify(a)} 단일=${JSON.stringify(b)}`,
          );
        }
      }
      const so = flatId(st.optionOf as string | null);
      const doo = (dt.option as string | null) ?? null;
      if (so !== doo) {
        problems.push(`${String(st.id)} · optionOf→option  시드=${so} 단일=${doo}`);
      }
    }
  }

  assert.deepEqual(problems, [], `두 앱의 프렙이 갈렸다:\n  ${problems.join("\n  ")}`);
});

test("★ 단일 파일에만 있는 프렙 항목이 없다 (시연에만 보이는 항목 금지)", () => {
  /* 위 테스트는 "시드에 있는데 단일에 없는 것" 을 잡는다. 반대 방향도 봐야
     한다 — 시연에서만 보이는 항목이 있으면 심사위원이 본 화면이 제품에 없다. */
  const extra: string[] = [];
  for (const dl of DATA.prepLists) {
    const sl = seed.prepLists.find((l) => l.slug === dl.slug);
    for (const dt of dl.tasks) {
      const has = sl?.tasks.some((t) => flatId(t.id as string) === dt.id);
      if (!has) extra.push(`${dl.slug}/${String(dt.id)} (${String(dt.title)})`);
    }
  }
  assert.deepEqual(extra, [], `단일 파일에만 있는 항목: ${extra.join(", ")}`);
});

test("프렙 목록 슬러그·이름이 같다", () => {
  assert.deepEqual(
    DATA.prepLists.map((l) => `${l.slug} ${l.name}`).sort(),
    seed.prepLists.map((l) => `${l.slug} ${l.name}`).sort(),
  );
});

test("발동 조건(trigger)은 모양이 다르지만 비어 있지는 않다", () => {
  /* 시드는 `{type:"daily", at:"14:00"}`, 단일 파일은 `"매일 14:00"` 이다.
     문자열로 미리 만들어 두는 것은 설계이므로 값 비교를 하지 않는다.
     다만 **빈 채로 남는 것**은 잡는다 — 화면에 빈 칩이 뜬다. */
  for (const dl of DATA.prepLists) {
    for (const dt of dl.tasks) {
      assert.equal(
        typeof dt.trigger,
        "string",
        `${dl.slug}/${String(dt.id)} 의 trigger 가 문자열이 아니다`,
      );
      assert.ok(
        String(dt.trigger).length > 0,
        `${dl.slug}/${String(dt.id)} 의 trigger 가 비었다`,
      );
    }
  }
});
