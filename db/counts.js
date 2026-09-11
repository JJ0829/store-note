/* ===========================================================================
 *  지금 스키마의 **현재 숫자**를 한 곳에서 뽑는다.
 *
 *  ★ 왜 (2026-09-11)
 *    문서에 적은 숫자가 하루 만에 낡았다 — "검사 29건" 이 55건이 됐고
 *    "표 22개" 가 37개가 됐는데 문서는 그대로였다. 심사가 그 모순을 잡았다.
 *    **사람이 세면 반드시 어긋난다.** 그래서 한 곳에서 뽑아 파일로 남기고,
 *    db/docs.js 가 문서의 숫자를 이 파일과 대조한다.
 *
 *  실행:  node db/counts.js        (db/.counts.json 에 쓴다)
 * ======================================================================== */
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { btree_gist } = require("@electric-sql/pglite/contrib/btree_gist");

const OUT = path.join(__dirname, ".counts.json");

async function 세기() {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(`
    create schema auth; create table auth.users (id uuid primary key);
    create role authenticated;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(fs.readFileSync(path.join(__dirname, "schema_v2.sql"), "utf-8"));
  const one = async (s) => Number((await db.query(s)).rows[0].n);

  const 표 = await one(`select count(*) n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
                         where ns.nspname='public' and c.relkind='r'`);
  const 외래키 = await one(`select count(*) n from pg_constraint
                             where contype='f' and connamespace='public'::regnamespace`);
  const 유니크 = await one(`select count(*) n from pg_constraint
                             where contype='u' and connamespace='public'::regnamespace`);
  const 겹침금지 = await one(`select count(*) n from pg_constraint
                               where contype='x' and connamespace='public'::regnamespace`);
  const 인덱스 = await one(`select count(*) n from pg_indexes where schemaname='public'`);
  const 뷰 = await one(`select count(*) n from pg_views where schemaname='public'`);
  const 정책 = await one(`select count(*) n from pg_policy p join pg_class c on c.oid=p.polrelid
                           join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public'`);
  const 생성칸 = await one(`select count(*) n from information_schema.columns
                             where table_schema='public' and is_generated='ALWAYS'`);
  const 여러칸 = await one(`select count(*) n from pg_constraint
                             where contype='f' and connamespace='public'::regnamespace
                               and array_length(conkey,1) >= 2`);
  const 세칸 = await one(`select count(*) n from pg_constraint
                           where contype='f' and connamespace='public'::regnamespace
                             and array_length(conkey,1) >= 3`);
  await db.close();
  return { 표, 외래키, 유니크, 겹침금지, 인덱스, 뷰, 정책, 생성칸, 여러칸, 세칸 };
}

/** 검사기들이 자기 통과 건수를 여기에 적는다. 문서가 그 숫자를 인용한다. */
function 합치기(추가) {
  let 기존 = {};
  try { 기존 = JSON.parse(fs.readFileSync(OUT, "utf-8")); } catch { /* 처음이면 없다 */ }
  const 새것 = { ...기존, ...추가, 적은시각: new Date().toISOString() };
  fs.writeFileSync(OUT, JSON.stringify(새것, null, 2) + "\n", "utf-8");
  return 새것;
}

module.exports = { 세기, 합치기, OUT };

if (require.main === module) {
  세기().then((c) => {
    const all = 합치기(c);
    console.log("\n  db/.counts.json 에 적었다:");
    for (const [k, v] of Object.entries(all)) console.log(`    ${k} = ${v}`);
    console.log("");
  }).catch((e) => { console.error("오류:", e.message); process.exit(1); });
}
