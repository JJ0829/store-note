#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 * public/media/촬영목록.md 를 시드에서 만든다.
 *
 * ★ 왜 만들었나 (2026-09-12)
 *
 *   이 파일은 **사장님이 폰을 들고 보는 목록**이다. 손으로 적어둔 것이라
 *   시드가 자라는 동안 조용히 낡았다 — 실제로 재보니 **57개만 적혀 있고
 *   28개가 빠져 있었다.** 빠진 것은 바 부재료 레시피 여섯(청·냉침차·밀크티·
 *   시럽·크림폼·르방)과 오후 프렙에 나중에 들어온 항목들, 그리고
 *   **마감 준비 세 개는 표가 통째로 없었다.**
 *
 *   목록에 없으면 안 찍는다. 안 찍으면 그 항목은 영영 회색으로 남는다.
 *   그리고 아무도 그 사실을 모른다 — 목록은 그럴듯하게 채워져 있으니까.
 *
 *   이 저장소는 같은 교훈을 이미 한 번 배웠다:
 *   `db6fb4d` "문서 숫자 검사가 「손으로 적은 목록」 이라 또 빠졌다 — 전수로 바꿈".
 *
 * 쓰는 법:  node db/shootlist.js          (덮어쓴다)
 *          node db/shootlist.js --check  (다르면 1로 끝난다)
 *
 * 검사는 `tests/mediaProbe.test.ts` 가 같이 본다 — 시드에 항목을 더하면
 * 그 테스트가 걸리고, 걸리면 이 스크립트를 다시 돌리라는 뜻이다.
 * ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "media", "촬영목록.md");
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seed.json"), "utf-8"));

/** 기준이 사람마다 가장 갈리는 넷. `docs/day-flow.md` 의 「영상으로 박제할 1순위」 */
const FIRST = [
  ["추출 테스트 — 합격 / 불합격", "t-open-5"],
  ["스팀 밀크 — 고운 거품 / 거친 거품", "s-lt-2"],
  ["르방·발효 — 완료 / 과발효", "t-bake-1"],
  ["콜드브루 거는 장면", "p-1"],
];

/** 「묶음 머리」 — 할 일이 아니라 이름표라 찍을 장면이 없다.
 *  `src/lib/repo.ts` 의 `headerIds()` 와 같은 규칙이어야 한다. */
function headerIds(list) {
  const kids = new Map();
  for (const t of list.tasks) {
    if (!t.optionOf) continue;
    const cur = kids.get(t.optionOf);
    if (cur) cur.push(t);
    else kids.set(t.optionOf, [t]);
  }
  const out = new Set();
  for (const [id, ks] of kids) if (ks.some((k) => !k.optional)) out.add(id);
  return out;
}

/** 찍을 수 있는 것 전부 — 그룹 단위로 묶어서 돌려준다 */
export function groups() {
  const out = [];
  for (const p of seed.positions)
    out.push({
      name: `${p.name} (포지션)`,
      items: p.sections.flatMap((s) =>
        s.steps.map((st) => ({ id: st.id, title: st.title, critical: !!st.critical })),
      ),
    });
  for (const r of seed.recipes)
    out.push({
      name: `${r.name} (레시피)`,
      items: r.sections.flatMap((s) =>
        s.steps.map((st) => ({ id: st.id, title: st.title, critical: !!st.critical })),
      ),
    });
  for (const l of seed.prepLists) {
    const heads = headerIds(l);
    out.push({
      name: `${l.name} (프렙)`,
      items: l.tasks
        .filter((t) => !heads.has(t.id))
        .map((t) => ({ id: t.id, title: t.title, critical: !!t.critical })),
    });
  }
  return out;
}

export function build() {
  const gs = groups();
  const total = gs.reduce((n, g) => n + g.items.length, 0);
  const L = [];

  L.push("# 촬영 목록");
  L.push("");
  L.push("> ⚠️ **이 파일은 `node db/shootlist.js` 가 시드에서 만든다. 손으로 고치지 말 것.**");
  L.push("> 손으로 적어두던 때 **28개가 빠진 채로** 있었다 — 목록에 없으면 안 찍는다.");
  L.push("");
  L.push("찍은 파일을 `public/media/` 폴더에 **아래 이름 그대로** 넣으면 화면에 바로 뜹니다.");
  L.push("JSON을 고칠 필요 없습니다. 아직 안 넣은 자리는 회색 칸에 **넣어야 할 파일명이 적혀** 있습니다.");
  L.push("");
  L.push("- 사진 확장자: `.jpg` `.png` `.jpeg` `.webp` 아무거나");
  L.push("- 영상 확장자: `.mp4` `.mov` `.webm`");
  L.push("- 좋은 예만 있어도 됩니다. 나쁜 예는 없으면 회색으로 남습니다");
  L.push("");
  L.push(`**전부 ${total}개입니다.** 한 번에 다 찍을 일이 아닙니다 — 아래 4개부터 하세요.`);
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 먼저 찍을 4개");
  L.push("");
  L.push("기준이 사람마다 가장 갈리는 항목입니다. **이 4개만 있어도 발표는 됩니다.**");
  L.push("");
  L.push("| 무엇을 | 좋은 예 | 나쁜 예 | 영상 |");
  L.push("|---|---|---|---|");
  for (const [label, id] of FIRST)
    L.push(`| ${label} | \`${id}-good.jpg\` | \`${id}-bad.jpg\` | \`${id}.mp4\` |`);
  L.push("");
  L.push("영상은 **각 30초면 충분합니다.** 편집하지 마세요. 폰으로 그냥 찍으면 됩니다.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 전체 목록");
  L.push("");
  L.push("파일명은 `앞부분-good.jpg` / `앞부분-bad.jpg` / `앞부분.mp4` 형태입니다.");
  L.push("");

  for (const g of gs) {
    L.push(`### ${g.name}`);
    L.push("");
    L.push("| 항목 | 파일명 앞부분 |");
    L.push("|---|---|");
    for (const it of g.items)
      L.push(`| ${it.title}${it.critical ? " **(꼭 지키기)**" : ""} | \`${it.id}\` |`);
    L.push("");
  }

  return L.join("\n").replace(/\n+$/, "\n");
}

/* ★ 아래는 **직접 실행했을 때만** 돈다.
   `tests/mediaProbe.test.ts` 가 `groups()` 를 가져다 쓰는데, 이 부분이 모듈
   최상단에서 그냥 돌면 **테스트가 import 하는 순간 파일을 다시 써버린다.**
   실제로 그랬다 — 목록에서 세 줄을 지우고 테스트를 돌렸더니 통과했다.
   지운 것을 테스트가 스스로 복구해 놓고 "같다" 고 말한 것이다. */
const 직접실행 =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!직접실행) {
  // 모듈로 불렸다 — groups() / build() 만 내어준다
} else if (process.argv.includes("--check")) {
  const text = build();
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
  if (now.replace(/\r\n/g, "\n") === text) {
    console.log("촬영목록.md — 시드와 같다");
  } else {
    console.error("촬영목록.md 가 시드와 다르다. `node db/shootlist.js` 로 다시 만들 것.");
    process.exit(1);
  }
} else {
  fs.writeFileSync(OUT, build(), "utf-8");
  const n = groups().reduce((a, g) => a + g.items.length, 0);
  console.log(`촬영목록.md — ${n}개로 다시 만들었다`);
}
