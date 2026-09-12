import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ *
 * 화면 잠금 표가 코드와 같은가.
 *
 * ★ 왜 만들었나 (2026-09-11)
 *
 *   `tests/docs.test.ts` 는 **이름**이 어긋나는 것을 잡는다 — 파일·주소·저장소 키.
 *   그 문서 머리에 스스로 이렇게 적어뒀다:
 *
 *       "이 설명이 맞는 설명인가 는 기계가 못 본다. 그건 사람이 읽어야 한다."
 *
 *   그런데 **잠금 표는 설명이 아니라 사실이다.** 기계가 볼 수 있다.
 *   그리고 실제로 낡았다 — `fb1389a`(2026-09-10) 가 `/prep/[slug]` 와 `/shoot` 에
 *   서버 게이트를 붙였는데, `21_화면명세.md` 는 **다음 날까지 "잠금 없음"** 이라고
 *   적고 있었다. 테스트 543개 중 아무것도 안 걸렸다. 숫자는 `seed.test.ts` 가
 *   못 박고 있었지만 **잠금은 아무도 안 박고 있었다.**
 *
 *   이게 이 저장소에서 반복되는 실패의 모양이다 —
 *   **코드가 고쳐지면 그 사실을 적어둔 문서 여덟 곳이 조용히 낡는다.**
 *   특히 "한계" 로 적어둔 문장은 더 안 고쳐진다. 좋은 소식이 왔을 때
 *   나쁜 소식을 적어둔 자리를 찾아갈 이유가 없기 때문이다.
 *
 * ★ 무엇을 보나
 *   `21_화면명세.md` §1 표의 `잠금` 칸 ↔ 그 화면 파일이 실제로 두른 게이트.
 *   화면 단위(페이지 파일)만 본다. 화면 안 일부만 가리는 것(`InlineUnlock`)은
 *   여기서 "없음" 으로 본다 — 표도 그렇게 적는다(`부분 (인건비만)`).
 * ------------------------------------------------------------------ */

const ROOT = process.cwd();
const 명세 = path.join(ROOT, "docs/deliverables/21_화면명세.md");

type 잠금 = "매장" | "사장님" | "없음";

/** 표의 `잠금` 칸을 세 값 중 하나로 읽는다 */
function 표에서(칸: string): 잠금 {
  if (칸.includes("🔑")) return "매장";
  if (칸.includes("🔒")) return "사장님";
  return "없음";
}

/** 화면 파일이 실제로 두른 게이트 */
function 코드에서(src: string): 잠금 {
  if (/<ServerStoreGate\b/.test(src)) return "매장";
  if (/<OwnerGate\b/.test(src)) return "사장님";
  return "없음";
}

/** 화면 주소 → 페이지 파일. 파일이 없으면 null (404 처럼 주소가 아닌 것) */
function 파일(주소: string): string | null {
  const rel =
    주소 === "/" ? "src/app/page.tsx" : `src/app${주소}/page.tsx`;
  return fs.existsSync(path.join(ROOT, rel)) ? rel : null;
}

/** §1 표에서 (화면 ID, 주소, 표가 말하는 잠금) 을 뽑는다 */
function 표읽기() {
  const 본문 = fs.readFileSync(명세, "utf-8");
  const 시작 = 본문.indexOf("## 1. 화면 목록");
  const 끝 = 본문.indexOf("## 1-b.");
  assert.ok(시작 >= 0 && 끝 > 시작, "21_화면명세.md 의 §1 을 못 찾았다");

  const rows: { id: string; 주소: string; 잠금: 잠금 }[] = [];
  for (const line of 본문.slice(시작, 끝).split("\n")) {
    // | **S-04** | `/prep/[slug]` | 프렙 | 오픈조 | ✅ | 🔑 매장 |
    const m = line.match(/^\|\s*\*\*(S-\d+)\*\*\s*\|\s*\**`([^`]+)`\**\s*\|/);
    if (!m) continue;
    const 칸 = line.split("|").map((s) => s.trim());
    rows.push({ id: m[1], 주소: m[2], 잠금: 표에서(칸[칸.length - 2]) });
  }
  return rows;
}

test("★ 화면 명세의 잠금 표가 코드와 같다", () => {
  const rows = 표읽기();
  const 어긋남: string[] = [];

  for (const r of rows) {
    const rel = 파일(r.주소);
    if (!rel) continue; // 404 등 — 주소가 아닌 행
    const 실제 = 코드에서(fs.readFileSync(path.join(ROOT, rel), "utf-8"));
    if (실제 !== r.잠금) {
      어긋남.push(
        `${r.id} ${r.주소} — 표: ${r.잠금} / 코드: ${실제}  (${rel})`,
      );
    }
  }

  assert.deepEqual(
    어긋남,
    [],
    "\n잠금이 문서와 코드에서 다르다. **코드가 맞다** — 21_화면명세.md §1 과 §4 를 고칠 것.\n" +
      "  그리고 같은 사실이 CLAUDE.md · HANDOFF.md · README.md · 06 · 13 · 19 · 배포.md 에도 적혀 있다.\n" +
      어긋남.map((s) => `  - ${s}`).join("\n") +
      "\n",
  );
});

test("검사 대상이 실제로 있다 (조용히 0행을 훑고 통과하지 않게)", () => {
  /* 표 형식이 바뀌면 정규식이 0행을 읽고도 통과한다. 그게 제일 위험하다 —
     검사한다고 믿는데 안 하는 것이기 때문이다. (docs.test.ts 와 같은 이유) */
  const rows = 표읽기();
  assert.ok(
    rows.length >= 15,
    `§1 표에서 ${rows.length}행만 읽었다. 표 형식이 바뀌었는지 확인할 것`,
  );
  const 검사됨 = rows.filter((r) => 파일(r.주소)).length;
  assert.ok(
    검사됨 >= 15,
    `주소를 파일로 못 찾은 행이 많다 (${검사됨}/${rows.length}). 라우트 구조가 바뀌었는지 확인할 것`,
  );
});

test("★ 게이트를 두른 화면이 표에도 전부 있다 (반대 방향)", () => {
  /* 위 검사는 **표에 있는 행**만 본다. 화면을 새로 만들고 잠갔는데
     표에 안 적으면 안 걸린다 — 그래서 반대 방향도 본다. */
  const 표주소 = new Set(표읽기().map((r) => r.주소));
  const 빠짐: string[] = [];

  const 훑기 = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) 훑기(p);
      else if (e.name === "page.tsx") {
        const 실제 = 코드에서(fs.readFileSync(path.join(ROOT, p), "utf-8"));
        if (실제 === "없음") continue;
        const 주소 =
          "/" + p.replace(/^src\/app\/?/, "").replace(/\/?page\.tsx$/, "");
        if (!표주소.has(주소 === "/" ? "/" : 주소)) {
          빠짐.push(`${주소} — ${실제} 잠금인데 §1 표에 없다 (${p})`);
        }
      }
    }
  };
  훑기("src/app");

  assert.deepEqual(
    빠짐,
    [],
    `\n잠근 화면이 21_화면명세.md §1 표에 없다. 화면을 더했으면 표에도 적을 것:\n` +
      빠짐.map((s) => `  - ${s}`).join("\n") +
      "\n",
  );
});

/* ------------------------------------------------------------------ *
 * ★ 한 화면 안에서 폭이 바뀌지 않는가 (2026-09-12)
 *
 *   `Screen` 의 `wide` 는 560px 과 900px 을 가른다. 그런데 여섯 화면이
 *   **본 화면에만 `wide` 를 붙이고 불러오는 중·빈 상태에는 안 붙이고 있었다.**
 *   그래서 열 때마다 560 으로 그려졌다가 데이터가 오면 900 으로 **한 번 튄다.**
 *   태블릿을 세워두고 쓰는 화면이라 매번 보인다.
 *
 *   빈 상태는 «데이터를 넣으러 가는 문» 이라 오히려 오래 머무는 화면이다.
 *   거기서 폭이 다르면 같은 화면으로 안 보인다.
 * ------------------------------------------------------------------ */
test("★ 한 화면의 모든 갈래가 같은 폭을 쓴다", () => {
  const dir = path.join(ROOT, "src/components");
  const 어긋남: string[] = [];

  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf-8");
    /* `<Screen` 으로 시작해 여는 태그가 닫히는 데(`>`)까지 */
    const 갈래 = [...src.matchAll(/<Screen\b[^>]*>/g)].map((m) => m[0]);
    if (갈래.length < 2) continue;

    const 넓은 = 갈래.filter((t) => /\bwide\b/.test(t)).length;
    if (넓은 !== 0 && 넓은 !== 갈래.length)
      어긋남.push(
        `${f} — <Screen> ${갈래.length}개 중 ${넓은}개만 wide ` +
          `(열 때 ${넓은 === 갈래.length ? "" : "560 → 900 으로 "}폭이 튄다)`,
      );
  }

  assert.deepEqual(
    어긋남,
    [],
    "한 화면 안에서 불러오는 중·빈 상태와 본 화면의 폭이 다르다:\n  " +
      어긋남.join("\n  "),
  );
});
