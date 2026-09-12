import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ *
 * 라이선스 감사가 지금 의존성과 같은가.
 *
 * ★ 왜 만들었나 (2026-09-11)
 *   `@electric-sql/pglite` 를 넣었더니 `04_라이선스감사.md` 가 그 순간 낡았다 —
 *   45개를 전수 조사한 문서인데 46개가 된 것이다. 문서는 오류를 내지 않는다.
 *   **의존성을 더하는 사람이 감사 문서를 떠올릴 이유가 없다**는 게 문제다.
 *
 *   그래서 기계가 떠올리게 한다.
 *
 * ★ 개수를 세지 않는 이유
 *   `node_modules` 전체 개수는 **플랫폼마다 다르다** — 04번 문서가 6절에서
 *   스스로 경고한다(Windows 와 Linux 의 네이티브 바이너리가 다르다).
 *   그걸 못 박으면 다른 PC 에서 무조건 깨진다.
 *
 *   대신 **우리가 직접 고른 것**만 본다. 그건 플랫폼과 무관하고,
 *   실제로 낡는 것도 그쪽이다.
 * ------------------------------------------------------------------ */

const ROOT = process.cwd();
const 원자료 = path.join(ROOT, "docs/deliverables/_라이선스_원자료.json");

type 항목 = { name: string; version: string; license: string; direct?: boolean };

const 읽기 = () =>
  JSON.parse(fs.readFileSync(원자료, "utf-8")) as {
    total: number;
    packages: 항목[];
    licenseCounts: Record<string, number>;
  };

const 직접의존성 = (): string[] => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
  );
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].sort();
};

test("★ package.json 의 직접 의존성이 라이선스 감사에 전부 있다", () => {
  const 감사 = new Map(읽기().packages.map((p) => [p.name, p]));
  const 빠짐 = 직접의존성().filter((n) => !감사.has(n));

  assert.deepEqual(
    빠짐,
    [],
    "\n의존성을 더했는데 라이선스 감사에 안 들어갔다.\n" +
      "  `docs/deliverables/_라이선스_원자료.json` 과 `04_라이선스감사.md`(§3 직접 의존성 · §4 요약 · 부록 4-4 · 변경 이력)를 같이 고칠 것.\n" +
      "  ★ 라이선스·전이 의존성 수·배포 산출물 포함 여부를 확인해서 적어야 한다 — 개수만 바꾸면 감사가 아니다.\n" +
      빠짐.map((n) => `  - ${n}`).join("\n") +
      "\n",
  );
});

test("★ 감사가 '직접' 이라고 적은 것이 실제로 직접 의존성이다", () => {
  const 직접 = new Set(직접의존성());
  const 거짓 = 읽기()
    .packages.filter((p) => p.direct && !직접.has(p.name))
    .map((p) => p.name);

  assert.deepEqual(
    거짓,
    [],
    `\n감사가 직접 의존성이라고 적었는데 package.json 에 없다 — 지웠으면 감사에서도 빼야 한다:\n` +
      거짓.map((n) => `  - ${n}`).join("\n") +
      "\n",
  );
});

test("★ 감사의 합계·라이선스 분포가 자기 목록과 맞는다", () => {
  /* 목록만 고치고 요약 숫자를 안 고치는 일이 실제로 일어난다.
     그러면 총평(§1)이 틀린 수를 말하게 된다 — 심사가 읽는 문단이다. */
  const j = 읽기();
  assert.equal(j.total, j.packages.length, "total 이 packages 수와 다르다");

  const 센것: Record<string, number> = {};
  for (const p of j.packages) 센것[p.license] = (센것[p.license] ?? 0) + 1;
  assert.deepEqual(
    j.licenseCounts,
    센것,
    "licenseCounts 가 packages 목록과 다르다",
  );
});

test("★ 04 문서의 합계가 원자료와 같다", () => {
  const j = 읽기();
  const 문서 = fs.readFileSync(
    path.join(ROOT, "docs/deliverables/04_라이선스감사.md"),
    "utf-8",
  );
  assert.ok(
    문서.includes(`## 4. 전체 ${j.total}개 요약`),
    `04_라이선스감사.md §4 제목이 원자료의 합계(${j.total})와 다르다`,
  );
  assert.ok(
    문서.includes(`| **합계** | **${j.total}** | **100%**`),
    `04_라이선스감사.md §4-1 표의 합계가 ${j.total} 이 아니다`,
  );
});
