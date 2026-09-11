/* ===========================================================================
 *  심사 피드백 한 줄 한 줄이 실제 코드에 들어갔는지 대조한다.
 *
 *  ★ verify.js 와 다르다.
 *    verify.js : "제약이 동작하는가" — 실제로 넣어 보고 거부되는지 본다
 *    audit.js  : "피드백 항목이 빠짐없이 반영됐는가" — 요구 ↔ 제약을 1:1로 맞춘다
 *
 *  그리고 심사가 마지막에 요구한 것을 한다:
 *    "DBML 의 Note 에 적힌 제약이 실제 SQL 에 구현됐는지 확인이 필요합니다"
 *    → SQL 의 외래키와 DBML 의 Ref 를 서로 대조한다. 둘이 갈리면 잡는다.
 *
 *  실행:  node db/audit.js
 * ======================================================================== */

const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { btree_gist } = require("@electric-sql/pglite/contrib/btree_gist");

const SQL = fs.readFileSync(path.join(__dirname, "schema_v2.sql"), "utf-8");
const DBML = fs.readFileSync(path.join(__dirname, "schema_v2.dbml"), "utf-8");

let pass = 0, fail = 0;
const ok = (s, x = "") => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${s}${x ? "  — " + x : ""}`); };
const no = (s, w) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${s}\n      ${w}`); };

/** 심사 피드백 → 그것을 실제로 막는 제약 */
const 요구 = [
  // ── 1차 심사 ─────────────────────────────────────────────────────
  ["1차-1", "매장 간 데이터 연결 차단", "fk_items_supplier_same_store"],
  ["1차-2", "원가 이력 — 기간 겹침 금지", "ex_item_versions_no_overlap"],
  ["1차-3", "입고가 발주 계획을 가리킨다", "fk_rl_plan_same_item"],
  ["1차-3", "제조가 제조 계획을 가리킨다", "fk_bl_plan_same_item"],
  ["1차-5", "추천 근거가 품목 규격을 가리킨다", "fk_ri_version_same_item"],

  // ── 2차 피드백 1 — 같은 "대상" 인지 ───────────────────────────────
  ["2차-1", "판매 메뉴 ↔ 메뉴 레시피 버전", "fk_sl_recipe_same_menu"],
  ["2차-1", "입고 품목 ↔ 발주 계획", "fk_rl_plan_same_item"],
  ["2차-1", "입고 품목 ↔ 품목 규격", "fk_rl_version_same_item"],
  ["2차-1", "생산 품목 ↔ 생산 계획", "fk_bl_plan_same_item"],
  ["2차-1", "생산 품목 ↔ 제조 레시피", "fk_bl_version_same_item"],
  ["2차-1", "생산 계획 ↔ 제조 레시피", "fk_bp_version_same_item"],
  ["2차-1", "추천 품목 ↔ 추천 당시 규격", "fk_ri_version_same_item"],

  // ── 2차 피드백 2 — 단위 계열 ─────────────────────────────────────
  ["2차-2", "item_versions.pack_family ↔ items.base_family", "fk_item_versions_item_same_store_and_family"],
  ["2차-2", "make_recipe_versions.yield_unit → units", "fk_krv_yield_family"],
  ["2차-2", "make_recipe_versions.yield_family ↔ items.base_family", "fk_krv_item_same_store_and_family"],
  ["2차-2", "baked_lines.unit_family 가 존재하고 units 를 참조", "fk_bl_unit_family"],
  ["2차-2", "baked_lines 계열 ↔ items.base_family", "fk_bl_item_same_store_and_family"],
];

(async () => {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(`
    create schema auth; create table auth.users (id uuid primary key);
    create role authenticated;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(SQL);

  const rows = async (q) => (await db.query(q)).rows;

  console.log("\n" + "=".repeat(74));
  console.log("  심사 피드백 대조 — 요구 한 줄당 제약 하나");
  console.log("=".repeat(74));

  // ── A. 요구별 제약 존재 확인 ────────────────────────────────────
  const 제약 = new Set(
    (await rows(`select conname from pg_constraint where connamespace='public'::regnamespace`))
      .map((r) => r.conname),
  );
  console.log("\n[A] 피드백 항목이 실제 제약으로 들어갔는가");
  let 현재 = "";
  for (const [출처, 설명, 이름] of 요구) {
    if (출처 !== 현재) { console.log(`\n  ── ${출처} ──`); 현재 = 출처; }
    if (제약.has(이름)) ok(설명, 이름);
    else no(설명, `제약 ${이름} 이 없다`);
  }

  // ── B. baked_lines.unit_family 칸 자체가 생겼는가 ───────────────
  console.log("\n[B] 없던 칸이 실제로 생겼는가");
  const 칸 = async (t, c) =>
    (await rows(`select 1 from information_schema.columns
                  where table_name='${t}' and column_name='${c}'`)).length > 0;
  for (const [t, c, why] of [
    ["baked_lines", "unit_family", "2차-2 — 칸 자체가 없었다"],
    ["stock_counts", "was_stockout", "자체 F — 품절을 기록할 곳이 없었다"],
    ["recommendation_inputs", "demand_avg", "자체 E — 계산 단계"],
    ["recommendation_inputs", "round_unit", "자체 E — 계산 단계"],
  ]) {
    (await 칸(t, c)) ? ok(`${t}.${c}`, why) : no(`${t}.${c}`, "칸이 없다");
  }

  // ── C. DBML ↔ SQL 대조 (심사가 요구한 것) ───────────────────────
  console.log("\n[C] DBML 에 적힌 관계가 실제 SQL 에 있는가  ← 심사 기타사항");

  const sqlFk = new Set(
    (await rows(`
      select src.relname||'('||
        (select string_agg(a.attname,',' order by k.ord)
           from unnest(c.conkey) with ordinality k(att,ord)
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.att)
        ||')->'||tgt.relname as sig
      from pg_constraint c
      join pg_class src on src.oid=c.conrelid
      join pg_class tgt on tgt.oid=c.confrelid
      where c.contype='f' and c.connamespace='public'::regnamespace`)).map((r) => r.sig),
  );

  // DBML 의 Ref 줄을 같은 모양으로 만든다
  const dbmlFk = new Set();
  // ★ 방향 기호는 > · - · < 셋 다 있다. > 만 보면 1:1 관계를 통째로 놓친다
  //   (실제로 3차에서 4개를 놓쳤다 — 방향을 고치자마자 대조에서 사라졌다)
  for (const m of DBML.matchAll(/^Ref:\s*([a-z_]+)\.(\([^)]*\)|[a-z_]+)\s*[>\-<]\s*([a-z_]+)\./gm)) {
    const cols = m[2].startsWith("(")
      ? m[2].slice(1, -1).split(",").map((x) => x.trim()).join(",")
      : m[2];
    dbmlFk.add(`${m[1]}(${cols})->${m[3]}`);
  }

  /* auth 스키마(로그인)는 Supabase 가 관리하는 것이라 그림에 안 그린다.
     users.id -> auth.users.id 가 여기 해당한다. */
  const 그림밖 = new Set(["users(id)->users"]);

  const dbml만 = [...dbmlFk].filter((x) => !sqlFk.has(x));
  const sql만 = [...sqlFk].filter((x) => !dbmlFk.has(x) && !그림밖.has(x));

  if (dbml만.length === 0)
    ok("DBML 의 모든 관계가 SQL 에 있다", `${dbmlFk.size}개 대조`);
  else
    no("DBML 에만 있고 SQL 엔 없는 관계", dbml만.join("\n      "));

  if (sql만.length === 0) ok("SQL 의 모든 외래키가 DBML 에도 있다", `${sqlFk.size}개`);
  else
    console.log(
      `  \x1b[33m△\x1b[0m SQL 에만 있고 DBML 엔 없는 외래키 ${sql만.length}개` +
        `\n      (그림에 안 그린 것 — 오류는 아니지만 알고 있어야 한다)\n      ` +
        sql만.join("\n      "),
    );

  // ── D. DBML Note 가 말하는 세 가지가 SQL 에 실제로 있는가 ────────
  console.log("\n[D] DBML 이 \"설명만 있다\" 던 세 가지가 SQL 에 실제로 있는가");
  const 정책 = Number((await rows(`select count(*) n from pg_policy`))[0].n);
  const 겹침 = Number((await rows(
    `select count(*) n from pg_constraint where contype='x' and connamespace='public'::regnamespace`))[0].n);
  const 뷰 = (await rows(`select viewname from pg_views where schemaname='public'`)).map((r) => r.viewname);
  const 표 = Number((await rows(
    `select count(*) n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='public' and c.relkind='r'`))[0].n);

  정책 >= 표 ? ok("RLS 정책", `${정책}개 (표 ${표}개)`) : no("RLS 정책", `${정책}개뿐`);
  겹침 >= 2 ? ok("기간 겹침 금지 제약", `${겹침}개 (item_versions · menu_prices)`) : no("기간 겹침 금지", `${겹침}개`);
  뷰.includes("v_order_fulfillment") && 뷰.includes("v_bake_fulfillment")
    ? ok("이행 상태 계산 뷰", 뷰.join(" · "))
    : no("이행 상태 뷰", `있는 뷰: ${뷰.join(", ")}`);

  // ── E. 그림의 관계 "방향" 이 맞는가 (dbdiagram 경고) ────────────────
  console.log("\n[E] 관계 방향 — 양쪽 유일키 선언과 기호가 맞는가");
  /* dbdiagram 은 두 방향 다 경고한다. ★ 처음엔 한쪽만 봐서 2건을 놓쳤다.
       A.(칸들) >  B  : A 쪽이 **유일하면** 틀렸다 (그건 1:1 이다)
       A.(칸들) -  B  : A 쪽이 **유일하지 않으면** 틀렸다 (1:1 이려면 유일해야 한다)
     한쪽만 보면 고친 뒤에 반대쪽이 튀어나온다. 실제로 그렇게 당했다. */
  const uniqSets = new Map();
  for (const m of DBML.matchAll(/^Table\s+"?([a-z_]+)"?\s*\{([\s\S]*?)^\}/gm)) {
    const sets = [];
    for (const c of m[2].matchAll(/^\s*([a-z_]+)\s+[^[\n]*\[[^\]]*\b(pk|unique)\b/gm)) sets.push([c[1]]);
    for (const ix of m[2].matchAll(/\(([^)]*)\)\s*\[[^\]]*\b(pk|unique)\b/g))
      sets.push(ix[1].split(",").map((x) => x.trim()));
    uniqSets.set(m[1], sets);
  }
  /* ★ 자식 쪽과 부모 쪽은 판정 기준이 **다르다**. 같게 봤다가 부모 쪽을 놓쳤다.

       자식 쪽 — **부분집합**이면 유일하다.
         user_id 하나가 unique 면 (user_id, store_id) 도 당연히 유일하다.
         "1:1 인가" 를 묻는 것이므로 이게 맞다.

       부모 쪽 — **정확히 그 칸 묶음**이 유일해야 한다.
         Postgres 가 그렇게 요구한다. FOREIGN KEY (a,b) REFERENCES t(c,d) 는
         t 에 (c,d) 정확히 그 묶음의 유일키가 있어야 만들어진다.
         dbdiagram 도 같은 기준으로 경고한다.
         여기에 부분집합을 쓰면 users.id 가 pk 라는 이유로
         (id, store_id) 가 없어도 통과해 버린다 — 실제로 그렇게 놓쳤다. */
  /* ★★ 기준은 하나다 — **그 칸 묶음이 유일키로 선언돼 있는가.**
     "user_id 가 이미 unique 니까 (user_id, store_id) 도 유일하다" 는
     논리적으로는 맞지만 **여기서는 안 통한다.**
     외래키도, dbdiagram 도 **선언된 묶음**을 요구한다.
     이 차이를 몰라서 경고를 세 번 되살렸다. 자식·부모 똑같이 본다. */
  const 유일선언 = (t, colArr) => {
    const key = [...colArr].sort().join(",");
    return (uniqSets.get(t) ?? []).some((u) => [...u].sort().join(",") === key);
  };
  const 자식유일한가 = 유일선언;
  const 부모유일한가 = 유일선언;
  const 방향 = [];
  /* ★ dbdiagram 은 **양쪽 다** 본다. 한쪽만 보면 고친 뒤 반대쪽이 살아난다.
       부모 쪽 : '>' 든 '-' 든 **항상 유일해야 한다** (기댈 키가 있어야 하니까)
       자식 쪽 : '-' 면 유일해야 하고, '>' 면 유일하면 안 된다
     처음엔 자식만 봤다가 부모 쪽 경고를 세 번 다시 받았다. */
  const REF = /^Ref:\s*([a-z_]+)\.(\([^)]*\)|[a-z_]+)\s*(>|-|<)\s*([a-z_]+)\.(\([^)]*\)|[a-z_]+)/gm;
  const 풀기 = (raw) =>
    (raw.startsWith("(") ? raw.slice(1, -1) : raw).split(",").map((x) => x.trim());
  for (const m of DBML.matchAll(REF)) {
    const [, child, rawC, op, parent, rawP] = m;
    const cc = 풀기(rawC), pc = 풀기(rawP);
    const cols = [...cc].sort().join(",");

    if (!부모유일한가(parent, pc))
      방향.push(`${child}.(${cols}) ${op} ${parent}.(${pc.join(",")})  — **부모** 쪽에 유일키가 없다`);

    const 자식유일 = 자식유일한가(child, cc);
    if (op === ">" && 자식유일)
      방향.push(`${child}.(${cols}) > ${parent}  — 자식이 유일하다. '-' 로 바꿀 것`);
    if (op === "-" && !자식유일)
      방향.push(`${child}.(${cols}) - ${parent}  — 자식이 유일하지 않다. unique 를 붙이거나 '>' 로 바꿀 것`);
  }
  방향.length === 0
    ? ok("관계 방향", `${uniqSets.size}개 표의 유일 키와 양방향 대조 — 어긋남 없음`)
    : no("관계 방향이 틀린 곳", 방향.join("\n      "));
  console.log("\n" + "=".repeat(74));
  console.log(`  통과 ${pass} · 실패 ${fail}`);
  console.log("=".repeat(74) + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("오류:", e.message); process.exit(1); });
