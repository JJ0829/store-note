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

  // ── 6-A. 3차에서 더한 운영 13표 ─────────────────────────────────────
  log("\n[6-A] 3차 추가 — 프렙·체크리스트·근무·근태·계약이 규칙을 지키는가");
  await db.exec(`
    insert into positions (id, store_id, share_slug, name) values
      ('c1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','cafe-open','오픈조');
    insert into prep_lists (id, store_id, slug, name) values
      ('c2000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','afternoon','오후 프렙');
    insert into shifts (id, store_id, name, start_at, end_at) values
      ('c3000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','마감조','14:30','22:30');
    insert into staff (id, store_id, name) values
      ('c4000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','김알바');
    -- 부모가 될 프렙 항목 (되돌릴 수 없는 것)
    insert into prep_tasks (id, store_id, list_id, title, kind, trigger_type, trigger_at,
                            lead_time_hours, recoverable, consequence) values
      ('c5000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'c2000000-0000-0000-0000-000000000001','내일용 반죽','time','daily','14:00',
       14, false, '내일 아침 빵이 없다');
  `);

  await mustAccept(db, "옵션 한 겹은 통과한다 (르방 → 반죽)",
    `insert into prep_tasks (id, store_id, list_id, title, kind, trigger_type, trigger_at,
                             lead_time_hours, recoverable, consequence, option_of, optional)
     values ('c5000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
             'c2000000-0000-0000-0000-000000000001','르방 갱신','time','daily','14:00',
             12, false, '복구에 2~3일 걸린다','c5000000-0000-0000-0000-000000000001', true);`);

  await mustReject(db, "★ 옵션의 옵션은 못 만든다 (한 겹만)",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, trigger_at,
                             recoverable, consequence, option_of, optional)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000001',
             '르방의 옵션','routine','daily','14:00', true, '', 'c5000000-0000-0000-0000-000000000002', true);`,
    "fk_prep_option_one_level");

  await mustReject(db, "routine 에 리드타임을 적을 수 없다 (없는 약속을 만든다)",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, trigger_at,
                             lead_time_hours, recoverable, consequence)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000001',
             '홀 정리','routine','daily','19:00', 3, true, '');`,
    "ck_prep_routine");

  await mustReject(db, "되돌릴 수 없는데 이유를 안 적을 수 없다",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, trigger_at,
                             lead_time_hours, recoverable, consequence)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000001',
             '콜드브루','time','daily','15:00', 18, false, '   ');`,
    "ck_prep_consequence");

  await mustReject(db, "조건 발동인데 조건 문장이 없을 수 없다",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, recoverable, consequence)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000001',
             '추출 테스트','routine','condition', true, '');`,
    "ck_prep_trigger");

  await mustReject(db, "섹션의 주인은 하나뿐이다 (포지션과 레시피 동시 금지)",
    `insert into sections (store_id, position_id, menu_recipe_version_id, title)
     values ('11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000001',
             'a3000000-0000-0000-0000-000000000001','섞인 섹션');`,
    "ck_sections_one_owner");

  await mustReject(db, "B매장 직원의 출퇴근을 A매장에 못 넣는다",
    `insert into staff (id, store_id, name) values
       ('c4000000-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-222222222222','B알바');
     insert into punches (store_id, staff_id, business_date, in_at)
     values ('11111111-1111-1111-1111-111111111111','c4000000-0000-0000-0000-0000000000b1','2026-03-01','09:00');`,
    "fk_punch_staff_same_store");

  await mustAccept(db, "자정을 넘는 마감조를 기록할 수 있다 (23:00 → 01:00)",
    `insert into punches (store_id, staff_id, business_date, in_at, out_at, crosses_midnight)
     values ('11111111-1111-1111-1111-111111111111','c4000000-0000-0000-0000-000000000001',
             '2026-03-02','23:00','01:00', true);`);

  await mustReject(db, "주기 점검의 주기를 0 으로 둘 수 없다 (늘 빨갛게 뜬다)",
    `insert into prep_cycle_state (store_id, task_id, last_done, every_days)
     values ('11111111-1111-1111-1111-111111111111','c5000000-0000-0000-0000-000000000001','2026-05-11', 0);`,
    "every_days");

  await mustAccept(db, "주기를 안 정하면 비워 둘 수 있다 (기록 없음으로 보여준다)",
    `insert into prep_cycle_state (store_id, task_id, last_done, every_days)
     values ('11111111-1111-1111-1111-111111111111','c5000000-0000-0000-0000-000000000002','2026-05-11', null);`);

  await mustReject(db, "같은 날 같은 항목을 두 번 체크할 수 없다",
    `insert into daily_checks (store_id, business_date, prep_task_id) values
       ('11111111-1111-1111-1111-111111111111','2026-03-01','c5000000-0000-0000-0000-000000000001'),
       ('11111111-1111-1111-1111-111111111111','2026-03-01','c5000000-0000-0000-0000-000000000001');`,
    "uq_daily_checks_prep");

  // ── 6-B. 전수 훑기가 찾아낸 3건 ─────────────────────────────────────
  log("\n[6-B] 전수 훑기가 찾은 것 — 지적에 없었지만 같은 규칙이 빠져 있던 자리");

  await db.exec(`
    insert into auth.users (id) values ('bbbbbbbb-0000-0000-0000-000000000009');
    insert into users (id, store_id, name) values
      ('bbbbbbbb-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','B직원계정');
  `);
  await mustReject(db, "A매장 직원에 B매장 로그인 계정을 붙인다",
    `insert into staff (store_id, name, user_id)
     values ('11111111-1111-1111-1111-111111111111','몰래직원','bbbbbbbb-0000-0000-0000-000000000009');`,
    "fk_staff_user_same_store");

  // 같은 식빵의 레시피를 한 판 더 만든다 (v2)
  await db.exec(`
    insert into make_recipe_versions (id, store_id, item_id, version, yield_amount, yield_unit, yield_family, valid_from)
    values ('a8000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
            'a1000000-0000-0000-0000-000000000003', 2, 8,'개','count','2026-06-01');
  `);
  await mustReject(db, "★ 계획은 레시피 v1 인데 제조 기록은 v2 를 가리킨다",
    `insert into baked_lines (store_id, item_id, bake_plan_id, make_recipe_version_id,
                              occurred_on, batches, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000003',
             'a9000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002',
             '2026-03-02', 1, '개','count');`,
    "fk_bl_plan_uses_that_recipe");

  await mustAccept(db, "계획과 같은 레시피 판이면 통과한다",
    `insert into baked_lines (store_id, item_id, bake_plan_id, make_recipe_version_id,
                              occurred_on, batches, unit, unit_family)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000003',
             'a9000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',
             '2026-03-02', 1, '개','count');`);

  // 다른 프렙 목록을 하나 더 만든다
  await db.exec(`
    insert into prep_lists (id, store_id, slug, name) values
      ('c2000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','cycle','주기 점검');
  `);
  await mustReject(db, "★ 다른 목록의 항목을 옵션으로 붙인다 (주기 점검 → 오후 프렙)",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, trigger_at,
                             recoverable, consequence, option_of, optional)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000002',
             '엉뚱한 옵션','routine','daily','14:00', true, '',
             'c5000000-0000-0000-0000-000000000001', true);`,
    "fk_prep_option_same_list");

  // ── 6-C. 3차 피드백 ─────────────────────────────────────────────────
  log("\n[6-C] 3차 피드백 — 지적한 시나리오를 그대로 넣어 본다");

  await mustReject(db, "★ 자기 자신을 옵션의 부모로 지정한다",
    `insert into prep_tasks (id, store_id, list_id, title, kind, trigger_type, trigger_at,
                             recoverable, consequence, option_of, optional)
     values ('c5000000-0000-0000-0000-0000000000aa','11111111-1111-1111-1111-111111111111',
             'c2000000-0000-0000-0000-000000000001','자기참조','routine','daily','14:00',
             true, '', 'c5000000-0000-0000-0000-0000000000aa', true);`,
    "fk_prep_option_one_level");

  await mustReject(db, "★ 사 오는 품목(purchased)을 '만드는 것' 자리에 붙인다",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, trigger_at,
                             recoverable, consequence, make_recipe_item)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000001',
             '우유 만들기?','routine','daily','14:00', true, '',
             'a1000000-0000-0000-0000-000000000001');`,
    "fk_prep_make_item_is_made");

  await mustAccept(db, "만드는 부재료(made)는 통과한다",
    `insert into prep_tasks (store_id, list_id, title, kind, trigger_type, trigger_at,
                             recoverable, consequence, make_recipe_item)
     values ('11111111-1111-1111-1111-111111111111','c2000000-0000-0000-0000-000000000001',
             '식빵 반죽','routine','daily','14:00', true, '',
             'a1000000-0000-0000-0000-000000000003');`);

  await mustReject(db, "체크리스트와 프렙을 **둘 다** 비워 둔다",
    `insert into daily_checks (store_id, business_date) values
       ('11111111-1111-1111-1111-111111111111','2026-03-05');`,
    "ck_daily_checks_one");

  /* ★ 처음엔 `select ... from steps limit 1` 로 넣었는데 steps 가 비어 있어서
     0행이 들어가고 "통과" 로 읽혔다. **0행은 통과가 아니다.**
     그래서 섹션·단계를 실제로 만들고 그 번호를 직접 쓴다. */
  await db.exec(`
    insert into sections (id, store_id, position_id, title) values
      ('c6000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'c1000000-0000-0000-0000-000000000001','오픈 준비');
    insert into steps (id, store_id, section_id, title) values
      ('c7000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
       'c6000000-0000-0000-0000-000000000001','제빙기 확인');
  `);
  await mustReject(db, "체크리스트와 프렙을 **둘 다** 채운다",
    `insert into daily_checks (store_id, business_date, step_id, prep_task_id)
     values ('11111111-1111-1111-1111-111111111111','2026-03-05',
             'c7000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-000000000001');`,
    "ck_daily_checks_one");

  await mustAccept(db, "체크리스트 한 쪽만 채우면 통과한다",
    `insert into daily_checks (store_id, business_date, step_id)
     values ('11111111-1111-1111-1111-111111111111','2026-03-05',
             'c7000000-0000-0000-0000-000000000001');`);

  await mustReject(db, "같은 날 같은 단계를 두 번 체크한다",
    `insert into daily_checks (store_id, business_date, step_id)
     values ('11111111-1111-1111-1111-111111111111','2026-03-05',
             'c7000000-0000-0000-0000-000000000001');`,
    "uq_daily_checks_step");

  // B매장 직원·계정을 만들어 둔다
  await db.exec(`
    insert into staff (id, store_id, name) values
      ('c4000000-0000-0000-0000-0000000000b2','22222222-2222-2222-2222-222222222222','B실사자');
  `);
  await mustReject(db, "★ B매장 직원이 A매장 체크를 한 것으로 적는다",
    `insert into daily_checks (store_id, business_date, prep_task_id, checked_by)
     values ('11111111-1111-1111-1111-111111111111','2026-03-06',
             'c5000000-0000-0000-0000-000000000001','c4000000-0000-0000-0000-0000000000b2');`,
    "fk_check_staff_same_store");

  await mustReject(db, "★ B매장 직원이 A매장 재고를 센 것으로 적는다",
    `insert into stock_counts (store_id, item_id, counted_on, qty, unit, unit_family, counted_by)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001',
             '2026-03-06', 100,'ml','volume','c4000000-0000-0000-0000-0000000000b2');`,
    "fk_sc_counter_same_store");

  await mustReject(db, "★ B매장 계정이 A매장 발주 계획을 만든 것으로 적는다",
    `insert into order_plans (store_id, item_id, planned_on, qty, unit, unit_family, created_by)
     values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001',
             '2026-03-06', 10,'ml','volume','bbbbbbbb-0000-0000-0000-000000000001');`,
    "fk_op_creator_same_store");

  await mustReject(db, "★ B매장 계정이 A매장 추천을 돌린 것으로 적는다",
    `insert into recommendation_runs (store_id, kind, algo_version, params,
                                      horizon_from, horizon_to, ran_by)
     values ('11111111-1111-1111-1111-111111111111','order','order-v1','{}',
             '2026-02-15','2026-03-01','bbbbbbbb-0000-0000-0000-000000000001');`,
    "fk_reco_runner_same_store");

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

  /* ★ `force` 는 **매장 격리 표**에 요구한다 (지적 4). 이름이 아니라 근거로 좁힌다.
   *
   *   force 가 막는 것은 «표 주인(postgres)도 정책을 우회하지 못하게» 다.
   *   매장 격리는 주인에게도 서야 하므로 store_id 를 가진 표에는 반드시 건다.
   *
   *   `events`(이용 기록)에는 store_id 가 없다 — 매장을 안 나눈다.
   *   이 표의 정책이 막는 상대는 **익명 키**이고, 익명은 주인이 아니므로
   *   force 와 무관하게 정책이 선다. 반대로 force 를 걸면 사장님이 대시보드에서
   *   지표를 읽는 것만 막힌다. **막을 것을 막고, 아닌 것은 안 막는다.**
   *
   *   ⚠️ 이름 목록으로 빼지 않는 이유: 표를 하나 더 올리는 날 그 목록을
   *      아무도 안 고치고 조용히 검사에서 빠진다. store_id 는 그럴 수 없다.
   */
  const notForced = await q(`
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not c.relforcerowsecurity
      and exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=c.relname
                     and column_name='store_id')`);
  if (notForced.length === 0) ok("매장 격리 표는 주인에게도 강제 적용된다", "force row level security");
  else no("force 누락", notForced.map((r) => r.relname).join(", "));

  // ── 결과 ────────────────────────────────────────────────────────────
  log("\n" + "=".repeat(74));
  log(`  통과 ${pass} · 실패 ${fail}`);
  log("=".repeat(74) + "\n");
  // ★ 문서가 인용할 수 있게 통과 건수를 남긴다 (db/docs.js 가 대조한다)
  require("./counts").합치기({ "동작": pass });
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("\n예상 못 한 오류:", e.message);
  process.exit(1);
});
