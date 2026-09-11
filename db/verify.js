/* ===========================================================================
 *  schema_v2.sql 을 실제 PostgreSQL 에 올려서 검증한다.
 *
 *  PGlite = PostgreSQL 18 을 WASM 으로 빌드한 것. 진짜 Postgres 다.
 *  설치 없이 돌아가므로 "실행해 본 적 없다" 를 없앨 수 있다.
 *
 *  실행:  node db/verify.js
 *
 *  심사가 요구한 4가지 + 2차 피드백 2건을 전부 확인한다.
 * ======================================================================== */

const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { btree_gist } = require("@electric-sql/pglite/contrib/btree_gist");

const SQL = fs.readFileSync(path.join(__dirname, "schema_v2.sql"), "utf-8");

let pass = 0, fail = 0;
const log = (s = "") => console.log(s);

function ok(name, extra = "") {
  pass++; log(`  \x1b[32m✔\x1b[0m ${name}${extra ? "  — " + extra : ""}`);
}
function no(name, why) {
  fail++; log(`  \x1b[31m✘\x1b[0m ${name}\n      ${why}`);
}

/** 이 동작은 반드시 거부돼야 한다 */
async function mustReject(db, name, sql, expect) {
  try {
    await db.exec(sql);
    no(name, "거부되지 않고 그대로 저장됐다 ← 구멍");
  } catch (e) {
    const m = (e.message || "").split("\n")[0];
    if (expect && !m.includes(expect)) no(name, `거부는 됐는데 이유가 다르다: ${m}`);
    else ok(name, m.slice(0, 72));
  }
}

/** 이 동작은 반드시 통과해야 한다 */
async function mustAccept(db, name, sql) {
  try { await db.exec(sql); ok(name); }
  catch (e) { no(name, (e.message || "").split("\n")[0]); }
}

(async () => {
  const db = await PGlite.create({ extensions: { btree_gist } });

  // ── Supabase 흉내 ────────────────────────────────────────────────────
  // 실제 Supabase 에는 auth 스키마와 auth.uid() 가 이미 있다.
  // 여기서는 없으므로 같은 모양으로 만들어 준다.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
    create role authenticated;
    create role app_user login;
    grant authenticated to app_user;
  `);

  log("\n" + "=".repeat(74));
  log("  매장수첩 schema_v2.sql — 실제 PostgreSQL 검증");
  const v = await db.query("select version()");
  log("  " + v.rows[0].version.split(",")[0]);
  log("=".repeat(74));

  // ── 1. 스키마가 통째로 올라가는가 ───────────────────────────────────
  log("\n[1] 스키마 생성 — 외래키·인덱스가 오류 없이 만들어지는가");
  try {
    await db.exec(SQL);
    ok("schema_v2.sql 전체 실행");
  } catch (e) {
    no("schema_v2.sql 전체 실행", e.message);
    log("\n여기서 멈춘다. 아래 검사는 의미가 없다.");
    process.exit(1);
  }

  const q = async (s) => (await db.query(s)).rows;
  const cnt = async (s) => Number((await q(s))[0].n);

  const tables  = await cnt(`select count(*) n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r'`);
  const fks     = await cnt(`select count(*) n from pg_constraint where contype='f' and connamespace='public'::regnamespace`);
  const uniqs   = await cnt(`select count(*) n from pg_constraint where contype='u' and connamespace='public'::regnamespace`);
  const excls   = await cnt(`select count(*) n from pg_constraint where contype='x' and connamespace='public'::regnamespace`);
  const idxs    = await cnt(`select count(*) n from pg_indexes where schemaname='public'`);
  const views   = await cnt(`select count(*) n from pg_views where schemaname='public'`);
  const pols    = await cnt(`select count(*) n from pg_policy`);
  ok("개수", `표 ${tables} · 외래키 ${fks} · 유니크 ${uniqs} · 겹침금지 ${excls} · 인덱스 ${idxs} · 뷰 ${views} · 정책 ${pols}`);

  // 복합 외래키가 실제로 몇 개인지 (이번 작업의 핵심)
  const comp = await cnt(`select count(*) n from pg_constraint where contype='f' and connamespace='public'::regnamespace and array_length(conkey,1) >= 2`);
  const comp3 = await cnt(`select count(*) n from pg_constraint where contype='f' and connamespace='public'::regnamespace and array_length(conkey,1) >= 3`);
  ok("복합 외래키", `2칸 이상 ${comp}개 · 그중 3칸(대상까지 잠금) ${comp3}개`);

  // ── 준비: 매장 두 곳과 기본 데이터 ──────────────────────────────────
  await db.exec(`
    insert into stores (id, name, slug) values
      ('11111111-1111-1111-1111-111111111111','A 베이커리','a'),
      ('22222222-2222-2222-2222-222222222222','B 카페','b');

    insert into auth.users (id) values
      ('aaaaaaaa-0000-0000-0000-000000000001'),
      ('bbbbbbbb-0000-0000-0000-000000000001');
    insert into users (id, store_id, name, role) values
      ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','A사장','owner'),
      ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','B사장','owner');

    insert into suppliers (id, store_id, name) values
      ('a5000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','A거래처'),
      ('b5000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','B거래처');

    -- A매장 품목: 우유(부피) · 원두(무게) · 식빵(개수, 만드는 것)
    insert into items (id, store_id, supplier_id, name, kind, base_unit, base_family) values
      ('a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a5000000-0000-0000-0000-000000000001','우유','purchased','ml','volume'),
      ('a1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','a5000000-0000-0000-0000-000000000001','원두','purchased','g','weight'),
      ('a1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',null,'식빵','made','개','count');

    insert into menus (id, store_id, name) values
      ('a2000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','아메리카노'),
      ('a2000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','카페라떼');

    insert into menu_recipe_versions (id, store_id, menu_id, version, valid_from) values
      ('a3000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001',1,'2026-01-01'),
      ('a3000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002',1,'2026-01-01');

    insert into daily_sales (id, store_id, business_date) values
      ('a4000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-03-01');
  `);

  // ── 2. 1차 지적 1 — 매장 경계 ───────────────────────────────────────
  log("\n[2] 1차 지적 1 — 다른 매장 데이터가 연결되는가");
  await mustReject(db, "A매장 품목에 B매장 거래처를 붙인다",
    `insert into items (store_id, supplier_id, name, base_unit, base_family)
     values ('11111111-1111-1111-1111-111111111111','b5000000-0000-0000-0000-000000000001','몰래우유','ml','volume');`,
    "fk_items_supplier_same_store");

  // ── 3. 2차 피드백 1 — 같은 대상인가 ─────────────────────────────────
  log("\n[3] 2차 피드백 1 — 같은 매장이지만 다른 대상을 연결하는가");

  await mustReject(db, "아메리카노 판매에 라떼 레시피를 붙인다",
    `insert into sales_lines (store_id, daily_sales_id, menu_id, qty, menu_recipe_version_id)
     values ('11111111-1111-1111-1111-111111111111','a4000000-0000-0000-0000-000000000001',
             'a2000000-0000-0000-0000-000000000001', 1, 'a3000000-0000-0000-0000-000000000002');`,
    "fk_sl_recipe_same_menu");

  await mustAccept(db, "아메리카노 판매에 아메리카노 레시피는 통과한다",
    `insert into sales_lines (store_id, daily_sales_id, menu_id, qty, menu_recipe_version_id)
     values ('11111111-1111-1111-1111-111111111111','a4000000-0000-0000-0000-000000000001',
             'a2000000-0000-0000-0000-000000000001', 1, 'a3000000-0000-0000-0000-000000000001');`);

  // 원두 발주 계획 + 우유 규격을 만들어 둔다
  await db.exec(`
    insert into order_plans (id, store_id, item_id, planned_on, expected_on, qty, unit, unit_family) values
      ('a6000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'a1000000-0000-0000-0000-000000000002','2026-03-01','2026-03-03', 1000,'g','weight');
    insert into item_versions (id, store_id, item_id, unit_cost, per_unit, pack_unit, pack_family, validity) values
      ('a7000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'a1000000-0000-0000-0000-000000000001', 2000, 1000, 'ml','volume','[2026-01-01,2026-06-01)');
  `);

  await mustReject(db, "우유 입고에 원두 발주 계획을 붙인다",
    `insert into received_lines (store_id, item_id, order_plan_id, occurred_on, qty, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001',
             'a6000000-0000-0000-0000-000000000001','2026-03-03', 1000,'ml','volume');`,
    "fk_rl_plan_same_item");

  await mustReject(db, "원두 입고에 우유 규격을 붙인다",
    `insert into received_lines (store_id, item_id, item_version_id, occurred_on, qty, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000002',
             'a7000000-0000-0000-0000-000000000001','2026-03-03', 1000,'g','weight');`,
    "fk_rl_version_same_item");

  // 제조: 식빵 레시피 + 계획
  await db.exec(`
    insert into make_recipe_versions (id, store_id, item_id, version, yield_amount, yield_unit, yield_family, valid_from) values
      ('a8000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'a1000000-0000-0000-0000-000000000003',1, 6,'개','count','2026-01-01');
    insert into bake_plans (id, store_id, item_id, planned_on, expected_on, batches, make_recipe_version_id) values
      ('a9000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'a1000000-0000-0000-0000-000000000003','2026-03-01','2026-03-02', 1.5,'a8000000-0000-0000-0000-000000000001');
  `);

  await mustReject(db, "우유 제조 기록에 식빵 제조 계획을 붙인다",
    `insert into baked_lines (store_id, item_id, bake_plan_id, occurred_on, batches, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001',
             'a9000000-0000-0000-0000-000000000001','2026-03-02', 1,'ml','volume');`,
    "fk_bl_plan_same_item");

  await db.exec(`
    insert into recommendation_runs (id, store_id, kind, algo_version, params, horizon_from, horizon_to) values
      ('aa000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','order','order-v1','{}','2026-02-15','2026-03-01');
  `);
  await mustReject(db, "원두 추천에 우유 규격을 붙인다",
    `insert into recommendation_inputs (run_id, store_id, item_id, item_version_id, sold_qty, on_hand, recommended_qty)
     values ('aa000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
             'a1000000-0000-0000-0000-000000000002','a7000000-0000-0000-0000-000000000001', 10, 2, 12);`,
    "fk_ri_version_same_item");

  // ── 4. 2차 피드백 2 — 단위 계열 ─────────────────────────────────────
  log("\n[4] 2차 피드백 2 — 단위 계열 검증이 빠진 곳");

  await mustReject(db, "무게 품목(원두)에 1,000ml 규격을 등록한다",
    `insert into item_versions (store_id, item_id, unit_cost, per_unit, pack_unit, pack_family, validity)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000002',
             2000, 1000, 'ml','volume','[2026-01-01,2026-06-01)');`,
    "fk_item_versions_item_same_store_and_family");

  await mustReject(db, "개수로 나오는 식빵의 산출량을 g 으로 적는다",
    `insert into make_recipe_versions (store_id, item_id, version, yield_amount, yield_unit, yield_family, valid_from)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000003',
             9, 500,'g','weight','2026-01-01');`,
    "fk_krv_item_same_store_and_family");

  await mustReject(db, "식빵 제조 수량을 ml 로 적는다",
    `insert into baked_lines (store_id, item_id, occurred_on, batches, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000003',
             '2026-03-02', 1, 'ml','volume');`,
    "fk_bl_item_same_store_and_family");

  await mustReject(db, "단위와 계열 짝이 틀린 것(g 인데 volume)을 넣는다",
    `insert into baked_lines (store_id, item_id, occurred_on, batches, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000003',
             '2026-03-02', 1, 'g','volume');`,
    "fk_bl_unit_family");

  // ── 5. 기간 겹침 ────────────────────────────────────────────────────
  log("\n[5] 지적 2 — 같은 품목의 적용 기간을 겹쳐서 등록할 수 있는가");
  await mustReject(db, "우유 규격을 겹치는 기간으로 하나 더 등록한다",
    `insert into item_versions (store_id, item_id, unit_cost, per_unit, pack_unit, pack_family, validity)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001',
             2500, 900, 'ml','volume','[2026-03-01,2026-09-01)');`,
    "ex_item_versions_no_overlap");

  await mustAccept(db, "겹치지 않는 기간은 통과한다",
    `insert into item_versions (store_id, item_id, unit_cost, per_unit, pack_unit, pack_family, validity)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001',
             2500, 900, 'ml','volume','[2026-06-01,2026-12-01)');`);

  // ── 6. 이행 상태 뷰 ─────────────────────────────────────────────────
  log("\n[6] 지적 3 — 부분입고 · 완료 · 초과입고 · 미이행이 정확히 계산되는가");
  await db.exec(`
    insert into order_plans (id, store_id, item_id, planned_on, expected_on, qty, unit, unit_family) values
      ('ab000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','2026-03-01','2026-03-03', 10,'ml','volume'),
      ('ab000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','2026-03-01','2026-03-03', 10,'ml','volume'),
      ('ab000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','2026-03-01','2026-03-03', 10,'ml','volume'),
      ('ab000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','2026-03-01','2026-03-03', 10,'ml','volume'),
      ('ab000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','2026-03-01','2099-01-01', 10,'ml','volume');

    insert into received_lines (store_id, item_id, order_plan_id, occurred_on, qty, unit, unit_family) values
      ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000002','2026-03-03', 4,'ml','volume'),
      ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000002','2026-03-04', 3,'ml','volume'),
      ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000003','2026-03-03',10,'ml','volume'),
      ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000004','2026-03-03',12,'ml','volume');
  `);
  const expect = {
    "ab000000-0000-0000-0000-000000000001": ["미이행", 0],
    "ab000000-0000-0000-0000-000000000002": ["부분입고", 7],
    "ab000000-0000-0000-0000-000000000003": ["완료", 10],
    "ab000000-0000-0000-0000-000000000004": ["초과입고", 12],
    "ab000000-0000-0000-0000-000000000005": ["대기", 0],
  };
  const rows = await q(`select order_plan_id::text id, 상태, 입고수량::float qty
                        from v_order_fulfillment
                       where order_plan_id::text like 'ab0000%' order by id`);
  for (const r of rows) {
    const [st, qty] = expect[r.id] || [];
    if (r["상태"] === st && Number(r.qty) === qty) ok(`${st} (계획 10 · 입고 ${qty})`);
    else no(`${st} 판정`, `나온 값: 상태=${r["상태"]} 입고=${r.qty}`);
  }

  // ── 7. RLS ──────────────────────────────────────────────────────────
  log("\n[7] 지적 4 — 다른 매장 데이터의 조회와 등록이 모두 차단되는가");
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant select on auth.users to authenticated;
    insert into items (id, store_id, name, base_unit, base_family)
      values ('b1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','B매장우유','ml','volume');
  `);

  const asA = `set role app_user; set app.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';`;
  const reset = `reset role; reset app.user_id;`;

  await db.exec(asA);
  const seen = await q(`select store_id::text s, name from items order by name`);
  const onlyA = seen.every((r) => r.s === "11111111-1111-1111-1111-111111111111");
  if (onlyA && seen.length > 0) ok("조회 차단", `A사장에게 ${seen.length}건만 보인다 (B매장 것 0건)`);
  else no("조회 차단", `B매장 행이 보인다: ${JSON.stringify(seen)}`);

  const byId = await q(`select count(*) n from items where id='b1000000-0000-0000-0000-000000000001'`);
  if (Number(byId[0].n) === 0) ok("번호를 알아도 못 본다", "id 직접 조회 0건");
  else no("번호를 알아도 못 본다", "B매장 행이 조회됐다");

  await mustReject(db, "B매장 이름으로 데이터를 심는다 (with check)",
    `insert into items (store_id, name, base_unit, base_family)
     values ('22222222-2222-2222-2222-222222222222','몰래심기','ml','volume');`,
    "row-level security");

  // ★ RLS 의 UPDATE 는 "오류" 가 아니라 "안 보이니 0행" 으로 막는다.
  //   처음 테스트는 오류가 나기를 기대했는데 그건 내 오해였다.
  const r = await db.query(`update items set name='바꿔치기' where id='b1000000-0000-0000-0000-000000000001'`);
  if (Number(r.affectedRows ?? 0) === 0) ok("B매장 행 수정 차단", "안 보이므로 0행 — 오류가 아니라 무효가 맞다");
  else no("B매장 행 수정 차단", `${r.affectedRows}행이 바뀌었다`);

  // 내 행을 남의 매장으로 옮기는 것은 with check 가 막아야 한다
  await mustReject(db, "내 품목을 B매장 소유로 바꾼다 (with check)",
    `update items set store_id='22222222-2222-2222-2222-222222222222'
      where id='a1000000-0000-0000-0000-000000000001';`,
    "row-level security");

  await db.exec(reset);
  const still = await q(`select name from items where id='b1000000-0000-0000-0000-000000000001'`);
  if (still[0] && still[0].name === "B매장우유") ok("수정 차단 확인", "B매장 행이 그대로다");
  else no("수정 차단 확인", `바뀌었다: ${JSON.stringify(still)}`);

  // 정책이 안 걸린 표가 있는지 (심사에 그대로 낼 수 있는 검사)
  const naked = await q(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname='public' and c.relkind='r'
    group by c.relname, c.relrowsecurity
    having c.relrowsecurity = false or count(p.polname) = 0`);
  if (naked.length === 0) ok("모든 표에 정책이 걸렸다", `표 ${tables}개 전부`);
  else no("정책 누락", naked.map((r) => r.relname).join(", "));

  const notForced = await q(`
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not c.relforcerowsecurity`);
  if (notForced.length === 0) ok("표 주인에게도 강제 적용된다", "force row level security");
  else no("force 누락", notForced.map((r) => r.relname).join(", "));

  // ── 결과 ────────────────────────────────────────────────────────────
  log("\n" + "=".repeat(74));
  log(`  통과 ${pass} · 실패 ${fail}`);
  log("=".repeat(74) + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("\n예상 못 한 오류:", e.message);
  process.exit(1);
});
