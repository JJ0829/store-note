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
  recipes: {
    slug: string;
    name: string;
    ingredients: { name: string }[];
    sections?: { steps: { title: string }[] }[];
  }[];
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
  /* ★ 레시피·프렙은 2026-09-10 부터 **정적 파일이 없다.**
     서버 게이트(`ServerStoreGate`)가 쿠키를 보느라 요청마다 그린다.
     그게 이 잠금이 진짜인 이유다 — 미리 만들어 두면 그 파일이 그냥 나간다.
     그래서 여기서는 **공개 화면**만 본다. */
  const missing: string[] = [];
  const want = [
    ...seed.positions.map((p) => `p/${p.shareSlug}.html`),
    ...seed.positions.map((p) => `t/${p.shareSlug}.html`),
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

test("★ 레시피는 이제 정적 파일로 안 나간다 (V-19 해소)", (t) => {
  if (!built) return t.skip(SKIP);

  /* ★ 2026-09-10 이전에는 여기가 반대였다.
   *
   *  그때 이 자리에는 "레시피가 잠겨 있어도 HTML 에 그대로 실려 나간다" 를
   *  못 박은 테스트가 있었다. 매장 PIN 이 브라우저 안에서만 돌아서, 서버는
   *  잠금과 무관하게 레시피를 그려 보냈다 — `curl` 로 PIN 없이 읽혔다.
   *  그 테스트에 **"서버 보호가 생기면 깨진다, 그때 일부러 고치라"** 고
   *  적어뒀었고, 지금이 그 순간이다.
   *
   *  이제 `ServerStoreGate` 가 쿠키를 보고 없으면 `children` 을 렌더하지
   *  않는다. 렌더를 안 하니 하이드레이션 페이로드에도 안 실린다.
   *  그리고 `cookies()` 를 부르므로 **정적 파일 자체가 안 만들어진다.**
   *
   *  ⚠️ 다만 `STORE_PIN` 을 안 넣고 배포하면 서버는 **안 막는다**
   *  (사장님 결정: 환경변수를 깜빡해서 시연 중 레시피가 안 열리는 쪽이 더
   *  큰 사고다). 대신 화면이 빨간 띠로 크게 말한다 — 아래 테스트가 그걸 본다. */
  const gated = ["r.html", "r/americano.html", "prep.html", "prep/afternoon.html"];
  const stillStatic = gated.filter((rel) => fs.existsSync(path.join(OUT, rel)));

  assert.deepEqual(
    stillStatic,
    [],
    "레시피 화면이 정적 파일로 만들어졌다 — 그 파일은 게이트를 안 거치고 그냥 나간다: " +
      stillStatic.join(", "),
  );
});

test("★ 서버 PIN 이 없을 때 조용히 열지 않고 화면이 알린다", (t) => {
  /* 사장님이 고른 것은 "열어두되 크게 알린다" 다. 알림이 빠지면 그냥
     조용히 열린 것이고, 그게 이번 작업 내내 없애려던 바로 그것이다. */
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "ServerStoreGate.tsx"),
    "utf-8",
  );
  assert.match(src, /storePinConfigured\(\)/, "설정 여부를 안 본다");
  assert.match(src, /매장 번호가 설정되어 있지 않습니다/, "알리는 문구가 없다");
  assert.match(src, /role="alert"/, "스크린리더가 못 읽는다");
});

test("★ 잠겼을 때 children 을 렌더하지 않는다 (렌더하면 페이로드에 실린다)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "ServerStoreGate.tsx"),
    "utf-8",
  );
  /* 잠긴 갈래가 `children` 을 그리면 화면에는 안 보여도 하이드레이션
     페이로드에 실려 나간다. 예전 `StoreGate` 가 정확히 그랬다. */
  const locked = src.slice(src.indexOf("if (!cookieMatches("));
  const upToReturn = locked.slice(0, locked.indexOf("}"));
  assert.ok(
    !upToReturn.includes("{children}"),
    "잠긴 갈래에서 children 을 그린다 — 안 보여도 소스에는 들어간다",
  );
  assert.match(upToReturn, /StoreUnlockForm/, "입력칸을 안 보낸다");
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

/* ------------------------------------------------------------------ *
 * ★ 레시피가 보이는 화면은 전부 잠겨 있는가
 *
 *   2026-09-10 에 `/prep/<슬러그>` 하나가 빠져 있었다. 목록(`/prep`)에는
 *   게이트가 있는데 **정작 배합을 보여주는 상세**가 열려 있었다.
 *
 *   왜 그랬나 — 게이트를 걸 당시에는 프렙 상세가 그냥 할 일 목록이었다.
 *   그 뒤 **프렙 안에 레시피를 합치면서**(만드는 순서까지) 전제가 깨졌는데
 *   게이트를 같이 옮기지 않았다. 결정은 그때 맞았고 나중에 조용히 틀려졌다.
 *
 *   그래서 사람의 기억이 아니라 **산출물**로 검사한다 — 보이는 마크업에
 *   배합이 있으면 그 화면은 잠금이 없는 것이다.
 * ------------------------------------------------------------------ */

/** `<script>` 를 걷어낸, 사람 눈에 보이는 마크업만 */
function visibleMarkup(rel: string): string {
  return html(rel).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
}

test("★ 배합이 보이는 마크업에 나오는 화면이 없다 (전부 잠금 뒤에 있다)", (t) => {
  if (!built) return t.skip(SKIP);

  /* ★ 탐침을 **시드에서 뽑는다.**
   *
   *  처음에는 `["강력분","드라이이스트","탈지분유"]` 세 낱말로 박아뒀는데,
   *  그래서 **`/shoot` 이 통과했다** — 거기에는 그 세 낱말이 없고 대신
   *  레시피 이름 10개와 만드는 순서가 통째로 나와 있었다.
   *  탐침이 좁으면 테스트가 거짓 안심을 준다. 그게 이번 작업 내내
   *  없애려던 바로 그것이다. (2026-09-10)
   *
   *  ⚠️ 흔한 낱말은 뺀다 — "물"·"설탕"·"우유" 는 체크리스트에도 있어서
   *  공개 화면까지 잡아버린다. 그래서 **네 글자 이상**만 쓴다. */
  /* ★ 레시피 **이름**은 안 넣는다. 메뉴판은 벽에 붙어 있고 신입도 본다 —
     비밀은 **배합과 만드는 순서**다. 이름까지 넣으면 첫 화면의
     `레시피 찾기` 목록까지 잡아서, 진짜 유출과 구분이 안 된다. */
  const probes = [
    ...seed.recipes.flatMap((r) => r.ingredients.map((i) => i.name)),
    ...seed.recipes.flatMap((r) =>
      (r.sections ?? []).flatMap((sec) => sec.steps.map((t) => t.title)),
    ),
  ].filter((x) => typeof x === "string" && x.length >= 4);

  const leaking: string[] = [];

  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) {
        const rel = path.relative(OUT, p).split(path.sep).join("/");
        const vis = visibleMarkup(rel);
        const hit = probes.filter((x) => vis.includes(x));
        if (hit.length) {
          const shown = hit.slice(0, 3).join(", ");
          leaking.push(
            `${rel} (${hit.length}건: ${shown}${hit.length > 3 ? " …" : ""})`,
          );
        }
      }
    }
  };
  walk(OUT);

  assert.deepEqual(
    leaking,
    [],
    "잠금 없이 배합이 보이는 화면이 있다: " +
      leaking.join(", ") +
      ". 해당 page.tsx 를 ServerStoreGate 로 감쌀 것",
  );
});

test("★ 레시피를 다루는 라우트에 게이트가 붙어 있다 (코드 쪽 확인)", (t) => {
  /* 위 테스트는 **결과**를 본다. 이건 **원인**을 본다 — 시드가 바뀌어
     식빵이 빠지면 위 테스트는 통과해 버리기 때문이다. */
  const need = [
    "src/app/r/page.tsx",
    "src/app/r/[slug]/page.tsx",
    "src/app/r/my/page.tsx",
    "src/app/r/new/page.tsx",
    "src/app/prep/page.tsx",
    "src/app/prep/[slug]/page.tsx", // ← 2026-09-10 에 빠져 있던 곳
  ];
  const naked: string[] = [];
  for (const rel of need) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
    /* ★ `ServerStoreGate` 여야 한다. `StoreGate`(브라우저)로 되돌아가면
       화면만 가리고 서버는 레시피를 그대로 보낸다 — 원래대로 돌아간다. */
    if (!/<ServerStoreGate\b/.test(src)) naked.push(rel);
  }
  assert.deepEqual(naked, [], `서버 게이트가 빠진 라우트: ${naked.join(", ")}`);
});

/* ------------------------------------------------------------------ *
 * ★ 크래시가 흰 화면으로 끝나지 않는가
 *
 *   2026-09-10 에 실제로 봤다 — 모양이 깨진 레시피 하나에
 *   `Application error: a client-side exception has occurred` 한 줄만 남았다.
 *   그 원인은 고쳤지만 **그런 일이 또 없으리라는 보장은 없다.**
 *   심사 시연 중 태블릿이 흰 화면이 되면 거기서 끝이다.
 * ------------------------------------------------------------------ */

test("★ 오류 화면이 있다 (없으면 크래시 = 흰 화면 + 영어 한 줄)", () => {
  const app = path.join(process.cwd(), "src", "app");
  for (const name of ["error.tsx", "global-error.tsx"]) {
    assert.ok(
      fs.existsSync(path.join(app, name)),
      `${name} 이 없다 — 이게 없으면 Next 기본 화면(영어 한 줄)이 뜬다`,
    );
  }
});

test("★ 오류 화면이 '무엇을 하면 되는지' 를 준다", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "error.tsx"),
    "utf-8",
  );
  assert.match(src, /reset\(\)|onClick=\{reset\}/, "다시 시도할 방법이 없다");
  assert.match(src, /href="\/"/, "처음으로 갈 방법이 없다");
  // 기록이 남아 있다는 것을 말해줘야 한다. 사장님이 제일 먼저 걱정하는 것이다
  assert.match(src, /기록은/, "입력한 것이 무사한지 말해주지 않는다");
  // 영어 스택을 그대로 띄우지 않는다 (도움도 안 되고 경로가 섞여 나온다)
  assert.ok(!/\{error\.message\}|\{error\.stack\}/.test(src), "오류 원문을 띄운다");
});

test("★ global-error 는 공통 컴포넌트에 기대지 않는다", () => {
  /* layout 이 터졌을 때 뜨는 마지막 그물이다. 그 상황에서 공통 컴포넌트를
     쓰면 **그중 하나가 터진 것일 수도** 있어서 같이 죽는다. */
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "global-error.tsx"),
    "utf-8",
  );
  assert.ok(!/@\/components/.test(src), "공통 컴포넌트를 쓴다 — 같이 죽을 수 있다");
  assert.match(src, /<html/, "layout 없이 뜨는 화면인데 html 을 안 만든다");
});
