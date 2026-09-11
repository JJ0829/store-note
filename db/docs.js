/* ===========================================================================
 *  제출 문서가 **지금 상태와 같은 말을 하는가.**
 *
 *  ★ 왜 만들었나 (2026-09-11 · 3차 피드백)
 *    심사가 첫 줄에 이렇게 썼다 —
 *      "문서 상단에는 29개 검사를 통과했다고 적혀 있지만,
 *       하단에는 실제 DB에서 실행한 적이 없다고 적혀 있습니다.
 *       그리고 RLS 설명에는 22개 테이블이라고 되어 있지만 이후 13개가 추가되었습니다."
 *
 *    스키마가 아니라 **문서가 틀렸다.** 그리고 이건 고쳐도 또 낡는다 —
 *    숫자는 커밋마다 바뀌는데 문서는 안 바뀌기 때문이다.
 *    **손으로 세는 한 반드시 어긋난다.** 그래서 기계가 센다.
 *
 *  두 가지를 본다:
 *    [1] 문서에 적힌 숫자 = db/.counts.json 의 현재 값인가
 *    [2] 지금은 사실이 아닌 문장이 남아 있지 않은가 (자기모순)
 *
 *  실행:  node db/docs.js      (먼저 verify·audit·sweep·checkdbml 이 돌아야 한다)
 * ======================================================================== */

const fs = require("fs");
const path = require("path");
const { OUT } = require("./counts");

const 뿌리 = path.join(__dirname, "..");
const 제출물 = path.join(뿌리, "docs", "제출물");

let pass = 0, fail = 0;
const ok = (s, x = "") => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${s}${x ? "  — " + x : ""}`); };
const no = (s, list) => {
  fail++;
  console.log(`  \x1b[31m✘\x1b[0m ${s} — ${list.length}건`);
  list.forEach((x) => console.log(`      ${x}`));
};

console.log("\n" + "=".repeat(74));
console.log("  문서 검사 — 제출 문서가 지금 상태와 같은 말을 하는가");
console.log("=".repeat(74));

// ── 숫자 파일이 낡지 않았는가 ────────────────────────────────────────
let 값;
try { 값 = JSON.parse(fs.readFileSync(OUT, "utf-8")); }
catch {
  console.log("\n  \x1b[31m✘\x1b[0m db/.counts.json 이 없다 — npm run check 를 통째로 돌릴 것\n");
  process.exit(1);
}
{
  /* ★ 낡은 숫자로 대조하면 **틀린 것을 통과시킨다.** 그게 제일 나쁘다.
     스키마가 숫자 파일보다 나중에 고쳐졌으면 대조 자체를 거부한다. */
  const 숫자시각 = fs.statSync(OUT).mtimeMs;
  const 늦은것 = ["schema_v2.sql", "schema_v2.dbml"]
    .filter((f) => fs.statSync(path.join(__dirname, f)).mtimeMs > 숫자시각);
  if (늦은것.length) {
    console.log(`\n  \x1b[31m✘\x1b[0m 숫자 파일이 낡았다 — ${늦은것.join(" · ")} 가 더 나중에 고쳐졌다`);
    console.log("      node db/counts.js 를 먼저 돌릴 것\n");
    process.exit(1);
  }
}

const 합계 = 값.동작 + 값.대조 + 값.훑기 + 값.그림;

/** 문서가 인용한 숫자 — [파일, 찾을 문구, 그 자리에 와야 할 값들] */
const 주장 = [
  ["db/schema_v2.dbml", /(\d+)개 표 전부에 "로그인한 사람의 매장 줄만" 정책/, [값.표]],

  ["docs/제출물/storenote_erd_v3_20260911.html",
    /표 (\d+) · 외래키 (\d+) · 유니크 (\d+) · 겹침금지 (\d+) · 인덱스 (\d+) · 뷰 (\d+) · 정책 (\d+)/,
    [값.표, 값.외래키, 값.유니크, 값.겹침금지, 값.인덱스, 값.뷰, 값.정책]],
  ["docs/제출물/storenote_erd_v3_20260911.html",
    /2칸 이상 (\d+)개 · 그중 3칸\(대상까지\) (\d+)개/, [값.여러칸, 값.세칸]],
  ["docs/제출물/storenote_erd_v3_20260911.html",
    /외래키 (\d+) ↔ 관계 (\d+) 대조/, [값.외래키, 값.외래키 - 1]],
  ["docs/제출물/storenote_erd_v3_20260911.html",
    /동작 (\d+) · 대조 (\d+) · 훑기 (\d+) · 그림 (\d+) — 실패 0/,
    [값.동작, 값.대조, 값.훑기, 값.그림]],
  ["docs/제출물/storenote_erd_v3_20260911.html",
    /PostgreSQL 18에서 <b>동작 (\d+) · 대조 (\d+) · 훑기 (\d+) · 그림 (\d+)<\/b> 통과/,
    [값.동작, 값.대조, 값.훑기, 값.그림]],
  ["docs/제출물/storenote_erd_v3_20260911.html", /표 (\d+)개 전체 목록/, [값.표]],
  ["docs/제출물/storenote_erd_v3_20260911.html", /(\d+)개 표 전부<\/b>에 줄 단위 통제/, [값.표]],
  ["docs/제출물/storenote_erd_v3_20260911.html", /\((\d+)개 표 · 접근 통제/, [값.표]],

  ["docs/제출물/storenote_schema_v2_20260911.html",
    /동작 (\d+)건 · 대조 (\d+)건 · 훑기 (\d+)건 · 그림 (\d+)건 — 실패 0/,
    [값.동작, 값.대조, 값.훑기, 값.그림]],
  ["docs/제출물/storenote_schema_v2_20260911.html",
    /<b>동작 (\d+)건 · 대조 (\d+)건 · 훑기 (\d+)건 · 그림 (\d+)건<\/b>/,
    [값.동작, 값.대조, 값.훑기, 값.그림]],

  ["docs/제출물/index.html", /<b>DB<\/b> (\d+)/, [합계]],
];

console.log("\n[1] 문서에 적힌 숫자가 지금 값과 같은가");
{
  const bad = [];
  for (const [f, re, 기대] of 주장) {
    const p = path.join(뿌리, f);
    if (!fs.existsSync(p)) { bad.push(`${f} : 파일이 없다`); continue; }
    const m = fs.readFileSync(p, "utf-8").match(re);
    /* ★ 문구를 못 찾으면 **통과가 아니라 실패**다.
       문서를 고쳐 쓰면서 그 문장이 사라지면 검사는 조용히 0건을 훑는다.
       "0건은 통과가 아니다" — verify.js 에서 한 번 당한 것과 같은 함정. */
    if (!m) { bad.push(`${f} : 인용 문구를 못 찾았다 — ${re}`); continue; }
    기대.forEach((want, i) => {
      const got = Number(m[i + 1]);
      if (got !== want) bad.push(`${f} : "${m[0].slice(0, 60)}" 의 ${i + 1}번째 숫자 ${got} → ${want} 이어야 한다`);
    });
  }
  bad.length === 0
    ? ok("어긋난 숫자 없음", `인용 ${주장.length}곳 대조`)
    : no("낡은 숫자", bad);
}

/** 지금은 사실이 아닌 문장 — 남아 있으면 문서가 스스로 모순된다 */
const 금지문구 = [
  ["한 번도 실행해 보지", "PGlite 에 실제로 올려서 돌린다"],
  ["실행해 보지 못했", "PGlite 에 실제로 올려서 돌린다"],
  ["실행한 적이 없", "PGlite 에 실제로 올려서 돌린다"],
  ["PostgreSQL·Docker·Supabase CLI가 전부 없다", "PGlite 는 설치가 필요 없다"],
  ["표 22개", "37개다"],
  ["22개 표", "37개다"],
];

console.log("\n[2] 지금은 사실이 아닌 문장이 남아 있지 않은가");
{
  const 파일들 = fs.existsSync(제출물)
    ? fs.readdirSync(제출물).filter((f) => f.endsWith(".html")).map((f) => path.join(제출물, f))
    : [];
  파일들.push(path.join(__dirname, "schema_v2.dbml"));
  const bad = [];
  for (const p of 파일들) {
    /* ★ 받은 지적을 **그대로 인용한** 블록은 빼고 본다.
       인용문 안에는 "실행한 적이 없다고 적혀 있습니다" 같은 말이 당연히 들어 있다.
       그것까지 금지어로 잡으면, 지적을 정직하게 옮겨 적을수록 검사가 실패한다. */
    const s = fs.readFileSync(p, "utf-8").replace(/<div class="said">[\s\S]*?<\/div>/g, "");
    for (const [문구, 이유] of 금지문구)
      if (s.includes(문구))
        bad.push(`${path.relative(뿌리, p)} : "${문구}" 가 남아 있다 — ${이유}`);
  }
  파일들.length === 0
    ? no("검사할 문서를 못 찾았다", [`${제출물} 가 비어 있다`])
    : bad.length === 0
      ? ok("모순되는 문장 없음", `문서 ${파일들.length}개 · 금지 문구 ${금지문구.length}종`)
      : no("사실과 다른 문장", bad);
}

console.log("\n" + "=".repeat(74));
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log("=".repeat(74) + "\n");
process.exit(fail ? 1 : 0);
