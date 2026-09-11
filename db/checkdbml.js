/* ===========================================================================
 *  그림(DBML)이 dbdiagram.io 에서 **경고 없이** 그려지는가.
 *
 *  ★ 왜 파일로 만들었나 (2026-09-11)
 *    이 검사를 손으로만 돌렸더니, 경고가 네 번 되살아났다 (10 → 2 → 14 → 3 → 0).
 *    매번 "다 고쳤다" 고 말한 다음에 사장님이 화면에서 경고를 보셨다.
 *    **손으로 돌리는 검사는 안 돌린 검사와 같다.** 그래서 npm run check 에 넣는다.
 *
 *  검사 두 가지:
 *    1. @dbml/core 파서가 파일을 읽을 수 있는가 (문법)
 *    2. dbdiagram 이 경고를 띄우는 조건에 걸리는 관계가 있는가
 *       — 참조가 기대는 쪽에 **선언된 유일키**가 있어야 한다.
 *         "논리적으로 유일" 은 안 통한다. 선언돼 있어야 한다.
 *
 *  실행:  node db/checkdbml.js
 *
 *  ★ 2026-09-11 — 이 검사가 생긴 날부터 한 번도 안 돌았다.
 *    @dbml/core 를 db/node_modules 에서 직접 찾게 해놓고 package.json 에는
 *    안 적어서, 새로 받은 곳에선 무조건 MODULE_NOT_FOUND 로 죽었다.
 *    pglite 가 띄운 것과 **같은 실수이다** — 선언 안 된 의존성.
 *    그래서 devDependency 로 올리고 보통의 require 로 바꿈.
 *    (이게 안 돌면 counts 에 「그림」 값이 안 써져서 docs:db 까지 같이 죽는다)
 * ======================================================================== */

const fs = require("fs");
const path = require("path");
const { Parser } = require("@dbml/core");

const FILE = path.join(__dirname, "schema_v2.dbml");
const SRC = fs.readFileSync(FILE, "utf-8");

let pass = 0, fail = 0;
const ok = (s, x = "") => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${s}${x ? "  — " + x : ""}`); };
const no = (s, list) => {
  fail++;
  console.log(`  \x1b[31m✘\x1b[0m ${s} — ${list.length}건`);
  list.forEach((x) => console.log(`      ${x}`));
};

console.log("\n" + "=".repeat(74));
console.log("  그림 검사 — dbdiagram.io 가 경고를 띄우지 않는가");
console.log("=".repeat(74));

// ── 1. 문법 ────────────────────────────────────────────────────────────
console.log("\n[1] @dbml/core 파서가 읽을 수 있는가");
let db;
try {
  db = Parser.parse(SRC, "dbml").normalize();
  const 표 = Object.keys(db.tables).length;
  const 관계 = Object.keys(db.refs).length;
  ok("문법 오류 없음", `표 ${표}개 · 관계 ${관계}개`);
} catch (e) {
  /* ★ 파서는 {diags:[{message, location}]} 를 던진다.
     String(e) 로 찍으면 "[object Object]" 가 되어 **어디가 틀렸는지 못 본다.** */
  const 줄 = (e.diags ?? [e]).slice(0, 6).map(function (d) {
    var L = d.location && d.location.start;
    return (L ? L.line + "행 " + L.column + "칸" : "위치 모름") + " : " + (d.message || d);
  });
  no("문법 오류", 줄);
  console.log(`\n  통과 ${pass} · 실패 ${fail}\n`);
  process.exit(1);
}

// ── 2. 참조가 기대는 쪽에 선언된 유일키가 있는가 ────────────────────────
console.log("\n[2] 관계가 기대는 쪽에 **선언된** 유일키가 있는가");
/* ★ dbdiagram 의 "MISMATCHED OPTIONAL REF CONSTRAINTS" 경고가 나오는 자리다.
   기준은 하나다 — **그 칸 묶음이 유일키로 선언돼 있는가.**
   "user_id 가 이미 unique 니까 (user_id, store_id) 도 유일하다" 는
   논리적으로는 맞지만 dbdiagram 은 안 봐 준다. */
{
  // 표마다 "선언된 유일키 묶음" 을 모은다 (칸에 붙은 pk/unique + Indexes 의 것)
  const 유일 = new Map();
  for (const m of SRC.matchAll(/^Table\s+"?([a-z_]+)"?\s*\{([\s\S]*?)^\}/gm)) {
    const set = new Set();
    for (const c of m[2].matchAll(/^\s*([a-z_]+)\s+[^[\n]*\[[^\]]*\b(pk|unique)\b/gm)) set.add(c[1]);
    for (const ix of m[2].matchAll(/\(([^)]*)\)\s*\[[^\]]*\b(pk|unique)\b/g))
      set.add(ix[1].split(",").map((x) => x.trim()).sort().join(","));
    유일.set(m[1], set);
  }
  const 유일선언 = (t, arr) => (유일.get(t) ?? new Set()).has([...arr].sort().join(","));

  const bad = [];
  let n = 0;
  for (const line of SRC.split("\n")) {
    const m = line.match(/^Ref:\s*([a-z_]+)\.(\(?[^)>\-<]*\)?)\s*([>\-<])\s*([a-z_]+)\.(\(?[^)\n]*\)?)/);
    if (!m) continue;
    n++;
    const 칸 = (x) => x.replace(/[()]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    const [, 자식표, 자식칸, 기호, 부모표, 부모칸] = m;
    const c = 칸(자식칸), p = 칸(부모칸);

    // 부모 쪽은 **항상** 유일키여야 한다. 아니면 무엇을 가리키는지 정해지지 않는다
    if (!유일선언(부모표, p))
      bad.push(`${line.trim()}\n         └ 부모 ${부모표}(${p.join(", ")}) 에 유일키 선언이 없다`);

    // 기호는 자식 쪽 유일성으로 정해진다 — 유일하면 1:1('-'), 아니면 다:1('>')
    const 자식유일 = 유일선언(자식표, c);
    if (기호 === "-" && !자식유일)
      bad.push(`${line.trim()}\n         └ '-' 인데 자식 ${자식표}(${c.join(", ")}) 에 유일키 선언이 없다. '>' 여야 한다`);
    if (기호 === ">" && 자식유일)
      bad.push(`${line.trim()}\n         └ '>' 인데 자식 ${자식표}(${c.join(", ")}) 이 유일하다. '-' 여야 한다`);
  }
  bad.length === 0
    ? ok("경고 조건에 걸리는 관계 없음", `관계 ${n}개 양방향 대조`)
    : no("dbdiagram 이 경고할 관계", bad);
}

console.log("\n" + "=".repeat(74));
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log("=".repeat(74) + "\n");
// ★ 문서가 인용할 수 있게 통과 건수를 남긴다 (db/docs.js 가 대조한다)
require("./counts").합치기({ "그림": pass });
process.exit(fail ? 1 : 0);
