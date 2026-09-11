/* ===========================================================================
 *  전수 훑기 — "한 방향만 보는" 실수를 구조적으로 막는다.
 *
 *  ★ 왜 만들었나 (2026-09-11)
 *    오늘 같은 실수를 다섯 번 했다. 전부 같은 모양이다 —
 *    **지적받은 그 자리만 고치고, 같은 규칙이 적용돼야 할 나머지를 안 봤다.**
 *
 *      1. 매장이 같은지는 전부 잠갔는데 대상이 같은지는 한 곳도 안 봤다 (심사가 잡음)
 *      2. 레시피에 단위 계열을 걸고 규격·산출량에는 안 걸었다      (심사가 잡음)
 *      3. 문서 검사 정규식이 ASCII 만 봐서 한글 이름을 통째로 놓쳤다
 *      4. DBML 방향을 '>' 쪽만 보고 '-' 쪽을 안 봤다               (사장님이 잡음)
 *      5. 대조 정규식이 '>' 만 봐서 '-' 로 바꾼 4개를 놓쳤다
 *
 *    고칠 때마다 "그 한 건" 을 고쳤기 때문이다.
 *    그래서 이 파일은 **개별 사례가 아니라 규칙 전체를 훑는다.**
 *    규칙을 하나 정하면, 그 규칙이 적용돼야 할 자리를 전부 세어서 빠진 곳을 찾는다.
 *
 *  실행:  node db/sweep.js
 * ======================================================================== */

const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { btree_gist } = require("@electric-sql/pglite/contrib/btree_gist");

const SQL = fs.readFileSync(path.join(__dirname, "schema_v2.sql"), "utf-8");
const DBML = fs.readFileSync(path.join(__dirname, "schema_v2.dbml"), "utf-8");

let pass = 0, fail = 0;
const ok = (s, x = "") => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${s}${x ? "  — " + x : ""}`); };
const no = (s, list) => {
  fail++;
  console.log(`  \x1b[31m✘\x1b[0m ${s} — ${list.length}건`);
  list.forEach((x) => console.log(`      ${x}`));
};

/** 규칙 2 의 예외 — "대상이 빠졌다" 로 보이지만 **일부러 안 잠근** 것.
 *  이유 없이 예외로 빼면 다음 사람이 다시 조사해야 한다. */
const 규칙2_예외 = {
  "order_plans->items:supplier_id":
    "발주의 거래처는 품목의 기본 거래처와 다를 수 있다 — 이번만 다른 곳에서 사는 경우",
  "received_lines->items:supplier_id": "위와 같음",
  "received_lines->order_plans:supplier_id":
    "A 에 주문했는데 B 가 배송하는 일이 실제로 있다. 묶으면 그 입고를 못 적는다",
  "prep_tasks->prep_tasks:menu_id":
    "옵션이 부모와 다른 메뉴를 따라갈 수 있다 — 르방은 반죽의 옵션이지만 레시피가 다르다",
};

/** 규칙 3 의 예외 — 이름은 _unit 으로 끝나지만 **단위 코드가 아니라 수량**인 칸 */
const 단위아님 = new Map([
  ["item_versions.per_unit", "그 팩의 수량(1000)이다. 단위는 pack_unit 에 따로 있다"],
  ["recommendation_inputs.round_unit", "반올림 묶음 크기(12)다. 단위 코드가 아니다"],
]);

/** 대상을 가리키는 칸이 아닌 것 — 매장·시간·사람 같은 공통 칸은 뺀다 */
const 공통칸 = new Set([
  "id", "store_id", "created_at", "updated_at", "created_by", "note", "memo",
  "sort_order", "is_active", "name", "title", "descr", "slug",
]);

(async () => {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(`
    create schema auth; create table auth.users (id uuid primary key);
    create role authenticated;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(SQL);
  const q = async (s) => (await db.query(s)).rows;

  console.log("\n" + "=".repeat(74));
  console.log("  전수 훑기 — 규칙마다 '적용돼야 할 자리' 를 전부 센다");
  console.log("=".repeat(74));

  // 표별 칸 목록
  const cols = new Map();
  for (const r of await q(`select c.table_name t, c.column_name c
                             from information_schema.columns c
                             join information_schema.tables tb
                               on tb.table_schema=c.table_schema and tb.table_name=c.table_name
                            where c.table_schema='public' and tb.table_type='BASE TABLE'`)) {
    if (!cols.has(r.t)) cols.set(r.t, new Set());
    cols.get(r.t).add(r.c);
  }
  const 매장표 = new Set([...cols].filter(([, s]) => s.has("store_id")).map(([t]) => t));

  // 외래키 전량
  const fks = await q(`
    select c.conname,
           src.relname child, tgt.relname parent,
           (select array_agg(a.attname order by k.ord)
              from unnest(c.conkey) with ordinality k(att,ord)
              join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.att) ccols,
           (select array_agg(a.attname order by k.ord)
              from unnest(c.confkey) with ordinality k(att,ord)
              join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.att) pcols
    from pg_constraint c
    join pg_class src on src.oid=c.conrelid
    join pg_class tgt on tgt.oid=c.confrelid
    where c.contype='f' and c.connamespace='public'::regnamespace
      and tgt.relnamespace = 'public'::regnamespace`);   // auth.users 는 우리 표가 아니다

  // ── 규칙 1. 양쪽이 매장을 가지면 참조에 매장이 들어가야 한다 ─────────
  console.log("\n[규칙 1] 양쪽 표가 매장을 가지면 참조에 store_id 가 들어간다");
  {
    const bad = fks.filter((f) =>
      매장표.has(f.child) && 매장표.has(f.parent) &&
      f.parent !== "stores" && !f.ccols.includes("store_id"));
    const 대상 = fks.filter((f) => 매장표.has(f.child) && 매장표.has(f.parent) && f.parent !== "stores");
    bad.length === 0
      ? ok("빠진 곳 없음", `대상 ${대상.length}개 전부 복합`)
      : no("매장이 빠진 참조", bad.map((f) => `${f.child}(${f.ccols}) -> ${f.parent}  [${f.conname}]`));
  }

  // ── 규칙 2. 부모가 어떤 대상에 매달려 있으면 그 대상까지 잠근다 ──────
  console.log("\n[규칙 2] 부모가 대상(item_id·menu_id…)에 매달려 있으면 그것까지 잠근다");
  {
    const bad = [];
    for (const f of fks) {
      if (f.parent === "stores" || !매장표.has(f.child)) continue;
      const pc = cols.get(f.parent) ?? new Set();
      const cc = cols.get(f.child) ?? new Set();
      for (const c of pc) {
        if (공통칸.has(c) || !c.endsWith("_id")) continue;
        if (!cc.has(c)) continue;                 // 자식도 같은 대상을 들고 있어야 의미가 있다
        /* ★ 한 관계를 외래키 여러 개가 나눠 잠그는 경우가 있다.
           baked_lines -> bake_plans 가 (계획, 품목) 과 (계획, 레시피) 두 개로 걸린 것처럼.
           외래키 하나씩만 보면 "저쪽이 빠졌다" 가 서로를 가리키며 영영 안 끝난다.
           그래서 **같은 출발 칸을 쓰는 외래키 전부를 합쳐서** 본다. */
        const 합집합 = new Set(
          fks.filter((g) => g.child === f.child && g.parent === f.parent &&
                            g.ccols[0] === f.ccols[0])
             .flatMap((g) => g.ccols));
        if (합집합.has(c)) continue;              // 어느 외래키든 잠갔으면 됐다
        if (규칙2_예외[`${f.child}->${f.parent}:${c}`]) continue;   // 일부러 안 잠근 것
        bad.push(`${f.child}(${f.ccols}) -> ${f.parent}  :  ${c} 까지 넣어야 한다  [${f.conname}]`);
      }
    }
    bad.length === 0
      ? ok("빠진 곳 없음", "자식과 부모가 공유하는 대상 칸을 전부 잠갔다")
      : no("대상이 빠진 참조", [...new Set(bad)]);
  }

  // ── 규칙 3. 단위 칸에는 계열 검사가 따라붙는다 ──────────────────────
  console.log("\n[규칙 3] 단위 칸에는 (단위, 계열) 복합 참조가 따라붙는다");
  {
    const bad = [];
    let 대상 = 0;
    for (const [t, cs] of cols) {
      for (const c of cs) {
        if (!(c === "unit" || c.endsWith("_unit"))) continue;
        if (t === "units") continue;
        if (단위아님.has(`${t}.${c}`)) continue;
        대상++;
        const fam = c === "unit" ? "unit_family" : c.replace(/_unit$/, "_family");
        const has = fks.some((f) => f.child === t && f.parent === "units" &&
                                     f.ccols.includes(c) && f.ccols.includes(fam));
        if (!has) bad.push(`${t}.${c}  :  (${c}, ${fam}) -> units(code, family) 가 없다`);
      }
    }
    bad.length === 0
      ? ok("빠진 곳 없음", `단위 칸 ${대상}개 전부 계열까지 검사`)
      : no("계열 검사가 없는 단위 칸", bad);
  }

  // ── 규칙 4. 계열 칸은 품목의 기준 계열과 묶여야 한다 ────────────────
  console.log("\n[규칙 4] 계열 칸은 품목의 기준 계열(items.base_family)과 묶인다");
  {
    const bad = [];
    let 대상 = 0;
    for (const [t, cs] of cols) {
      if (t === "items" || t === "units") continue;
      if (!cs.has("item_id") && !cs.has("ingredient_item_id")) continue;
      const fam = [...cs].find((c) => c.endsWith("_family"));
      if (!fam) continue;
      대상++;
      const has = fks.some((f) => f.child === t && f.parent === "items" && f.ccols.includes(fam));
      if (!has) bad.push(`${t}.${fam}  :  items.base_family 와 묶이지 않았다`);
    }
    bad.length === 0
      ? ok("빠진 곳 없음", `계열 칸 ${대상}개 전부 품목과 묶임`)
      : no("품목과 안 묶인 계열 칸", bad);
  }

  // ── 규칙 5. 매장 표는 전부 RLS + force + 읽기/쓰기 조건 둘 다 ────────
  console.log("\n[규칙 5] 매장 표는 RLS · force · using · with check 를 전부 갖춘다");
  {
    const t = await q(`
      select c.relname, c.relrowsecurity rls, c.relforcerowsecurity forced,
             count(p.polname)::int pols,
             count(*) filter (where p.polcmd='*' and p.polwithcheck is null)::int 쓰기없음
        from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        left join pg_policy p on p.polrelid=c.oid
       where n.nspname='public' and c.relkind='r'
       group by c.relname, c.relrowsecurity, c.relforcerowsecurity`);
    const bad = t.filter((r) => !r.rls || !r.forced || r.pols === 0 || r["쓰기없음"] > 0)
      .map((r) => `${r.relname}  rls=${r.rls} force=${r.forced} 정책=${r.pols} 쓰기조건없음=${r["쓰기없음"]}`);
    bad.length === 0 ? ok("빠진 곳 없음", `표 ${t.length}개 전부`) : no("통제가 덜 걸린 표", bad);
  }

  // ── 규칙 6. SQL 의 칸이 그림(DBML)에도 있다 ─────────────────────────
  console.log("\n[규칙 6] SQL 의 칸이 그림에도 있다 (표만이 아니라 칸까지)");
  {
    const dbmlCols = new Map();
    for (const m of DBML.matchAll(/^Table\s+"?([a-z_]+)"?\s*\{([\s\S]*?)^\}/gm)) {
      const set = new Set();
      for (const line of m[2].split("\n")) {
        const c = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+\S/);
        if (c && !["Note", "Indexes"].includes(c[1])) set.add(c[1]);
      }
      dbmlCols.set(m[1], set);
    }
    const bad = [];
    for (const [t, cs] of cols) {
      const d = dbmlCols.get(t);
      if (!d) { bad.push(`${t} : 표 자체가 그림에 없다`); continue; }
      for (const c of cs) if (!d.has(c)) bad.push(`${t}.${c} 가 그림에 없다`);
    }
    bad.length === 0
      ? ok("빠진 곳 없음", `표 ${cols.size}개 · 칸 ${[...cols.values()].reduce((n, s) => n + s.size, 0)}개 대조`)
      : no("그림에 없는 칸", bad);
  }

  // ── 예외 목록이 낡지 않았는가 ────────────────────────────────────
  console.log("\n[규칙 7] 예외로 빼둔 것이 아직도 예외인가");
  {
    const 쓸모없는 = [];
    for (const k of Object.keys(규칙2_예외)) {
      const [pair, col] = k.split(":");
      const [child, parent] = pair.split("->");
      const f = fks.find((x) => x.child === child && x.parent === parent);
      if (!f) 쓸모없는.push(`규칙2_예외 "${k}" — 그런 참조가 이제 없다`);
      else if (f.ccols.includes(col)) 쓸모없는.push(`규칙2_예외 "${k}" — 이미 잠갔다. 예외를 지울 것`);
    }
    for (const k of 단위아님.keys()) {
      const [t, c] = k.split(".");
      if (!cols.get(t)?.has(c)) 쓸모없는.push(`단위아님 "${k}" — 그런 칸이 이제 없다`);
    }
    쓸모없는.length === 0
      ? ok("예외 목록이 최신이다", `규칙2 ${Object.keys(규칙2_예외).length}건 · 단위 ${단위아님.size}건`)
      : no("필요 없어진 예외", 쓸모없는);
  }

  console.log("\n" + "=".repeat(74));
  console.log(`  통과 ${pass} · 실패 ${fail}`);
  console.log("=".repeat(74) + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("오류:", e.message); process.exit(1); });
