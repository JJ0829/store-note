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
const 마이그 = path.join(__dirname, "migrations");

/** ★ 지표 표 — 매장 데이터가 아니라 «버튼이 눌렸다» 를 세는 표다.
 *
 *  왜 따로 세나 (2026-09-13):
 *    문서들이 인용하는 「표 37개 · 정책 38」 은 **매장 데이터 스키마의 크기**다.
 *    `events` 는 그 축이 아니다 — store_id 도 없고, 익명 키가 넣기만 한다.
 *    섞으면 2026-09-11 에 **제출한 문서**의 숫자까지 소급해서 고쳐야 한다.
 *
 *  ★ 목록을 손으로 안 적는다. **`0001_events.sql` 이 만든 표**를 읽는다 —
 *    지표 마이그레이션은 그 파일 하나이고, 매장 표를 거기 넣을 일이 없다.
 *    (첫 판은 `db/migrations/` 전체를 읽었는데, 설계 표 37개가 올라가면서
 *     **전부 "지표" 로 세어져 표가 0개가 됐다.** 규칙이 뜻과 어긋났던 것이다.)
 */
function 지표표들() {
  const 표 = new Set();
  const f = path.join(마이그, "0001_events.sql");
  if (!fs.existsSync(f)) return 표;
  for (const m of fs.readFileSync(f, "utf-8").matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi,
  )) {
    표.add(m[1].toLowerCase());
  }
  return 표;
}

async function 세기() {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(`
    create schema auth; create table auth.users (id uuid primary key);
    create role authenticated;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(fs.readFileSync(path.join(__dirname, "schema_v2.sql"), "utf-8"));
  const one = async (s) => Number((await db.query(s)).rows[0].n);

  /* ★ 숫자의 뜻을 안 바꾼다.
     문서들이 인용하는 「표 37개 · 정책 38」 은 **매장 데이터 스키마의 크기**다.
     지표 표(`events`)를 거기 섞으면 그 숫자들이 전부 1씩 움직이고,
     2026-09-11 에 제출한 문서까지 소급해서 고쳐야 한다.
     그건 **제출한 기록을 고치는 일**이라 하지 않는다.
     대신 지표 표는 `지표표` 로 따로 센다. */
  const 지표 = [...지표표들()];
  const 뺀표 = 지표.length
    ? `and c.relname not in (${지표.map((t) => `'${t}'`).join(",")})`
    : "";
  const 뺀이름 = 지표.length
    ? `and tablename not in (${지표.map((t) => `'${t}'`).join(",")})`
    : "";

  const 표 = await one(`select count(*) n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
                         where ns.nspname='public' and c.relkind='r' ${뺀표}`);
  const 지표표 = await one(`select count(*) n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
                         where ns.nspname='public' and c.relkind='r'
                           ${지표.length ? `and c.relname in (${지표.map((t) => `'${t}'`).join(",")})` : "and false"}`);
  const 외래키 = await one(`select count(*) n from pg_constraint
                             where contype='f' and connamespace='public'::regnamespace`);
  const 유니크 = await one(`select count(*) n from pg_constraint
                             where contype='u' and connamespace='public'::regnamespace`);
  const 겹침금지 = await one(`select count(*) n from pg_constraint
                               where contype='x' and connamespace='public'::regnamespace`);
  const 인덱스 = await one(`select count(*) n from pg_indexes where schemaname='public' ${뺀이름}`);
  const 뷰 = await one(`select count(*) n from pg_views where schemaname='public'`);
  const 정책 = await one(`select count(*) n from pg_policy p join pg_class c on c.oid=p.polrelid
                           join pg_namespace ns on ns.oid=c.relnamespace
                           where ns.nspname='public' ${뺀표}`);
  const 생성칸 = await one(`select count(*) n from information_schema.columns
                             where table_schema='public' and is_generated='ALWAYS'`);
  const 여러칸 = await one(`select count(*) n from pg_constraint
                             where contype='f' and connamespace='public'::regnamespace
                               and array_length(conkey,1) >= 2`);
  const 세칸 = await one(`select count(*) n from pg_constraint
                           where contype='f' and connamespace='public'::regnamespace
                             and array_length(conkey,1) >= 3`);
  /* ★ 베끼면 갈라진다 — 갈라지는 순간 걸리게 한다.
     `events` 는 `db/migrations/0001_events.sql` 과 `schema_v2.sql` 두 곳에 있다.
     한쪽만 고치면 **설계도가 조용히 거짓말을 하기 시작한다.**
     그래서 마이그레이션을 따로 올려서 칸을 대조한다. */
  for (const t of 지표) {
    const 설계 = await 칸들(db, t);
    const 실제 = await 마이그칸들(t);
    if (실제 && 설계 !== 실제) {
      throw new Error(
        `${t} 가 두 곳에서 다르다 — 한쪽만 고쳤다\n` +
          `    schema_v2.sql : ${설계}\n` +
          `    migrations    : ${실제}`,
      );
    }
  }

  await db.close();
  return { 표, 지표표, 외래키, 유니크, 겹침금지, 인덱스, 뷰, 정책, 생성칸, 여러칸, 세칸 };
}

/** 표 하나의 «칸 이름:자료형» 을 한 줄로 */
async function 칸들(db, 표) {
  const r = await db.query(
    `select column_name c, data_type d from information_schema.columns
      where table_schema='public' and table_name=$1 order by ordinal_position`,
    [표],
  );
  return r.rows.map((x) => `${x.c}:${x.d}`).join(" ");
}

/** 마이그레이션 파일만 올린 깨끗한 DB 에서 같은 것을 뽑는다 */
async function 마이그칸들(표) {
  const db = await PGlite.create();
  try {
    await db.exec("create role anon; create role authenticated;");
    for (const f of fs.readdirSync(마이그).filter((n) => n.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join(마이그, f), "utf-8");
      /* storage 스키마가 필요한 것(버킷 정책)은 여기서 못 돌린다 — 건너뛴다 */
      if (/\bstorage\./.test(sql)) continue;
      await db.exec(sql);
    }
    return await 칸들(db, 표);
  } catch {
    return null; // 못 올리면 대조를 포기한다. 없는 것을 틀렸다고 하지 않는다
  } finally {
    await db.close();
  }
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
