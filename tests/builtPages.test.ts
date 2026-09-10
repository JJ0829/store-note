/* ------------------------------------------------------------------ *
 * 실제로 나가는 HTML 을 본다.
 *
 * ★ 왜 이게 "화면 테스트" 인가 — **여기까지가 의존성 없이 갈 수 있는 끝이다.**
 *
 *   컴포넌트를 렌더해서 검사하려면 `.tsx` 를 읽을 트랜스파일러를 새로 깔아야
 *   한다(노드는 JSX 를 못 읽는다). 그런데 `next build` 는 **모든 화면을 이미
 *   HTML 로 만들어 놓는다.** 그게 실제로 사용자에게 나가는 물건이다.
 *   컴포넌트 단위보다 오히려 이쪽이 진짜다 — 렌더는 통과하는데 배포본이
 *   틀린 경우를 잡는다.
 *
 * ⚠️ **`npm run build` 를 먼저 돌려야 이 파일이 검사한다.**
 *   `.next` 가 없으면 조용히 통과하는 게 아니라 **건너뛴 것을 표시**한다.
 *   전체 점검은 `npm run build && npm test` 다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), ".next", "server", "app");
const built = fs.existsSync(OUT);
const SKIP = ".next 가 없다 — `npm run build` 뒤에 다시 돌릴 것";

type Seed = {
  positions: { shareSlug: string }[];
  recipes: { slug: string; name: string; ingredients: { name: string }[] }[];
  prepLists: { slug: string }[];
};

const seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "seed.json"), "utf-8"),
) as Seed;

function html(rel: string): string {
  return fs.readFileSync(path.join(OUT, rel), "utf-8");
}

function allHtml(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) out.push(p);
    }
  };
  walk(OUT);
  return out;
}

/* ------------------------------------------------------------------ *
 * 1. 시연 중 404 가 안 난다
 * ------------------------------------------------------------------ */

test("★ 시드의 슬러그마다 화면이 실제로 만들어졌다", (t) => {
  if (!built) return t.skip(SKIP);

  /* `seed.test.ts` 는 데이터 안에서 슬러그가 맞는지만 본다. 여기서는
     **빌드가 그 화면을 진짜로 뽑았는지** 본다 — 시드에는 있는데
     `generateStaticParams` 에서 빠지면 시연 중에 404 가 난다. */
  const missing: string[] = [];
  const want = [
    ...seed.positions.map((p) => `p/${p.shareSlug}.html`),
    ...seed.positions.map((p) => `t/${p.shareSlug}.html`),
    ...seed.recipes.map((r) => `r/${r.slug}.html`),
    ...seed.prepLists.map((l) => `prep/${l.slug}.html`),
  ];
  for (const rel of want) {
    if (!fs.existsSync(path.join(OUT, rel))) missing.push(rel);
  }
  assert.deepEqual(missing, [], `빌드에서 빠진 화면: ${missing.join(", ")}`);
});

test("★ 404 화면이 있다", (t) => {
  if (!built) return t.skip(SKIP);
  assert.ok(fs.existsSync(path.join(OUT, "_not-found.html")));
});

/* ------------------------------------------------------------------ *
 * 2. 발표장에서 인터넷이 끊겨도 되는가
 * ------------------------------------------------------------------ */

test("★ 빌드된 화면이 바깥에서 뭘 받아오지 않는다", (t) => {
  if (!built) return t.skip(SKIP);

  /* 단일 파일(`singleFile.test.ts`)에는 이 검사가 있는데 Next 빌드에는 없었다.
     V-12 로 Google Fonts 를 걷어냈지만, 폰트든 스크립트든 다시 들어오면
     발표장에서 인터넷이 끊겼을 때 화면이 무너진다.

     자기 주소(`NEXT_PUBLIC_SITE_URL`)는 뺀다 — og 태그에 필요하다. */
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const bad = new Set<string>();
  for (const f of allHtml()) {
    const src = fs.readFileSync(f, "utf-8");
    for (const m of src.match(/https?:\/\/[^"'\s<>\\]+/g) ?? []) {
      if (!m.startsWith(site)) bad.add(m);
    }
  }
  assert.deepEqual([...bad], [], `외부 주소가 들어갔다: ${[...bad].join(", ")}`);
});

test("배포 주소가 빌드에 박힌다 — localhost 로 나가면 카톡 미리보기가 깨진다", (t) => {
  if (!built) return t.skip(SKIP);

  /* `NEXT_PUBLIC_SITE_URL` 은 **빌드 시점에 박힌다.** 배포할 때 안 넣으면
     og:url 이 localhost 인 채로 나가고, 카톡으로 보낸 링크의 미리보기가
     사장님 노트북을 가리킨다. → `.env.example` 의 경고와 같은 내용이다.
     여기서는 "무엇이 박혔는지" 를 드러내기만 한다. 개발 빌드는 localhost 가 맞다. */
  const src = html("p/cafe-open.html");
  const m = src.match(/property="og:url" content="([^"]*)"/);
  const baked = m?.[1] ?? "(og:url 없음)";
  const expected = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  assert.ok(
    baked.startsWith(expected),
    `og:url 에 ${baked} 가 박혔다 (기대: ${expected} 로 시작). 배포 전에 환경변수를 넣을 것`,
  );
});

/* ------------------------------------------------------------------ *
 * 3. ★ 잠긴 화면이 실제로 무엇을 내보내는가
 *
 *   여기가 이 파일에서 가장 중요하다. 아래 두 테스트는 **지금 사실이
 *   그렇다는 것을 못 박아 둔 것**이지, 이게 옳다는 뜻이 아니다.
 *   서버 보호가 생기면 이 테스트가 깨진다 — 그때 **일부러** 고쳐야 한다.
 * ------------------------------------------------------------------ */

test("★ 지금 레시피는 잠겨 있어도 HTML 에 그대로 실려 나간다 (V-19)", (t) => {
  if (!built) return t.skip(SKIP);

  /* CLAUDE.md: "레시피는 공개 링크로 두면 안 된다. 영업비밀이다."
     그런데 매장 PIN(`StoreGate`) 은 **브라우저 안에서만** 돈다.
     서버는 잠금과 무관하게 레시피를 통째로 그려서 보낸다 —
     `curl` 이나 [페이지 소스 보기] 로 PIN 없이 전부 읽힌다.

     ★ 배포하면(D-010) 주소를 아는 사람은 누구나 받아볼 수 있다.
       발표에서 "PIN 으로 보호한다" 고 말하면 그건 사실이 아니다.
       → `06_보안설계` V-19 · 진짜 접근 통제는 서버가 있어야 한다

     이 테스트는 **그 사실을 지우지 못하게** 붙들어 둔다. */
  const src = html("r/americano.html");
  const recipe = seed.recipes.find((r) => r.slug === "americano");
  assert.ok(recipe, "아메리카노 레시피가 시드에 없다");

  for (const ing of recipe.ingredients) {
    assert.ok(
      src.includes(ing.name),
      `재료 "${ing.name}" 가 HTML 에서 사라졌다 — 서버 보호가 생겼다면 ` +
        "이 테스트를 지우고 06_보안설계 V-19 를 해소로 바꿀 것",
    );
  }
  // 잠금 화면조차 HTML 에 없다. 가림막은 하이드레이션 뒤에 씌워진다
  assert.ok(
    !src.includes("잠금번호"),
    "HTML 에 잠금 화면이 들어갔다 — 서버 쪽 처리가 생겼다는 뜻이다",
  );
});

test("★ 개인정보·매출은 HTML 에 안 들어간다 (브라우저에만 있기 때문)", (t) => {
  if (!built) return t.skip(SKIP);

  /* 잠긴 화면 중에서도 **출퇴근·계약·매출·거래처는 안 새어 나간다.**
     레시피와 달리 그 값들은 시드가 아니라 `localStorage` 에 있어서,
     서버가 그릴 것이 애초에 없다.

     ⚠️ 그래서 이건 "설계로 막았다" 가 아니라 **"아직 서버에 없어서 안 샌다"** 다.
     Supabase 로 옮기면 이 성질이 사라진다 — 그때 서버 쪽 접근 통제가 없으면
     레시피와 같은 처지가 된다. 옮기기 전에 이 테스트를 다시 볼 것. */
  for (const rel of ["sales.html", "vendors.html", "contracts.html", "attendance.html"]) {
    const src = html(rel);
    // 시드에 없는 값이므로 서버가 그릴 방법이 없다. 뼈대만 나가는지 본다
    assert.ok(src.length < 40_000, `${rel} 가 예상보다 크다 — 데이터가 실렸는지 확인할 것`);
  }
});

/* ------------------------------------------------------------------ *
 * 4. 화면이 비어 있을 때 무너지지 않는가
 * ------------------------------------------------------------------ */

test("★ 데이터가 없는 화면도 빈 채로 무너지지 않고 안내를 낸다", (t) => {
  if (!built) return t.skip(SKIP);

  /* 빌드 시점의 브라우저 저장소는 **항상 비어 있다.** 그래서 프리렌더된
     HTML 이 곧 "0건 상태" 다 — 이게 무너지면 새 태블릿에 처음 켠 사장님이
     빈 화면을 본다. Next 는 렌더가 터지면 빌드를 실패시키므로 파일이
     존재하는 것 자체가 1차 검사이고, 여기서는 **뼈대가 실제로 들어 있는지**
     본다 (빈 문자열이나 오류 페이지가 아닌지). */
  for (const rel of ["index.html", "attendance.html", "order.html", "backup.html"]) {
    const src = html(rel);
    assert.ok(src.length > 3_000, `${rel} 가 너무 작다 — 렌더가 반쯤 죽었을 수 있다`);
    assert.ok(!src.includes("Application error"), `${rel} 에 오류 화면이 나갔다`);
    assert.ok(src.includes("<main"), `${rel} 에 본문이 없다`);
  }
});

test("체크리스트 화면에 시드의 항목이 실제로 들어 있다", (t) => {
  if (!built) return t.skip(SKIP);

  /* 체크리스트는 **일부러 공개 링크**다 (CLAUDE.md: 체크리스트=공개 링크,
     레시피=매장 PIN). 그러니 여기 내용이 HTML 에 있는 것은 정상이고,
     오히려 **없으면** 링크를 받은 신입이 빈 화면을 본다. */
  const src = html("p/cafe-open.html");
  assert.match(src, /손 씻고 위생 복장 착용/);
  assert.match(src, /꼭 지키기/, "필수 항목 표시가 없다");
});
