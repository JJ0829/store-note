/* ------------------------------------------------------------------ *
 * 시연 데이터 (public/demo-backup.json)
 *
 * ★ 이 파일은 `/backup` 의 「시연 데이터 넣기」 가 **되돌리기와 같은 길**로
 *   읽는다. 그러니 되돌리기가 받아주는 모양이어야 하고(checkRestore),
 *   넣은 뒤 화면이 「원가율 · 인건비 · 하루 순익」 을 실제로 계산할 수 있어야
 *   한다 — 재료 이름이 한 글자라도 다르면 원가가 `missing` 으로 빠지고
 *   화면은 「단가를 채우세요」 만 보여준다. 발표에서 그게 뜨면 끝이다.
 *
 * ★ 그리고 **가짜여야 한다.** 전화·이메일이 하나라도 들어가면 이 파일은
 *   공개 폴더(public/)에 있으므로 그대로 새는 개인정보다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { backupCounts, checkRestore, type BackupFile } from "../src/lib/backup.ts";
import { costOfRecipe } from "../src/lib/cost.ts";
import { listRecipes } from "../src/lib/repo.ts";
import { workedMinutes } from "../src/lib/attendance.ts";

const FILE = path.join(process.cwd(), "public", "demo-backup.json");
const text = fs.readFileSync(FILE, "utf-8");
const BASE_DAY = "2026-09-14";

function loadDemo(): BackupFile {
  const r = checkRestore(text);
  assert.ok(r.ok, `되돌리기가 거부한다: ${r.ok ? "" : r.reason}`);
  return r.file;
}

test("★ 되돌리기(checkRestore)가 받아주는 모양이다", () => {
  const r = checkRestore(text);
  assert.ok(r.ok);
});

test("★ 스크립트 결과와 파일이 같다 — 손으로 고치면 여기서 걸린다", () => {
  const fresh = execFileSync(process.execPath, ["db/demo.js", "--print"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  assert.equal(text, fresh, "public/demo-backup.json 이 db/demo.js 와 다르다 — `node db/demo.js` 로 다시 만들 것");
});

test("담긴 개수 — 화면의 되돌리기 확인 표에 그대로 뜨는 숫자", () => {
  const c = backupCounts(loadDemo());
  assert.deepEqual(c, {
    staff: 4,
    punches: 22,
    contracts: 4,
    cycle: 12, // 13개 중 하나(c-8 그라인더)는 일부러 기록 없음
    salesDays: 13,
    vendors: 3,
    recipes: 0,
    orderDays: 6,
  });
});

test("★ 개인정보가 없다 — public/ 에 있는 파일이다", () => {
  const b = loadDemo();
  for (const s of b.roster.staff) {
    assert.equal(s.email, "", `${s.name} 이메일`);
    assert.equal(s.phone, "", `${s.name} 전화`);
  }
  for (const v of b.vendors?.vendors ?? []) {
    assert.equal(v.phone, "", `${v.name} 전화`);
    assert.equal(v.contact, "", `${v.name} 담당자`);
  }
  // 매장·거래처 이름은 시드와 같은 자리표시 꼴이어야 한다
  assert.match(b.storeName, /^○○ /);
  for (const v of b.vendors?.vendors ?? []) assert.match(v.name, /^[△□◇]{2} /);
});

test("★ 시드 레시피 14개 전부 원가가 잡힌다 (missing 0) — 재료 이름이 글자까지 같다", () => {
  const b = loadDemo();
  const items = b.vendors?.items ?? [];
  const excluded = b.settings?.excluded ?? [];
  const recipes = listRecipes();
  assert.equal(recipes.length, 14);
  for (const r of recipes) {
    const c = costOfRecipe(r, items, excluded);
    const missing = c.lines.filter((l) => l.cost === null && !l.excluded).map((l) => l.name);
    assert.equal(c.missing, 0, `${r.name}: 단가 없는 재료 ${missing.join(", ")}`);
    assert.ok(c.total > 0, `${r.name}: 원가가 0원`);
  }
});

test("판매가가 있는 레시피는 원가율이 목표(30%) 안쪽이다 — 화면이 빨갛게 뜨면 안 된다", () => {
  const b = loadDemo();
  const items = b.vendors?.items ?? [];
  const settings = b.settings!;
  for (const r of listRecipes()) {
    const price = settings.prices[r.id];
    if (!price) continue;
    const c = costOfRecipe(r, items, settings.excluded);
    const rate = (c.perUnit / price) * 100;
    assert.ok(rate > 5 && rate < settings.targetCostRate, `${r.name}: 원가율 ${rate.toFixed(1)}%`);
  }
});

test("출퇴근 — 퇴근까지 찍힌 것은 전부 0 < 근로시간 ≤ 10시간, 오늘 오픈조 한 명은 근무 중", () => {
  const b = loadDemo();
  let working = 0;
  for (const byDate of Object.values(b.punches)) {
    for (const p of Object.values(byDate)) {
      assert.ok(p.date <= BASE_DAY, `${p.date} 미래 기록`);
      if (!p.outAt) {
        assert.equal(p.date, BASE_DAY, "퇴근 안 찍은 기록은 오늘 것만");
        working += 1;
        continue;
      }
      const w = workedMinutes(p);
      assert.ok(w !== null && w > 0 && w <= 600, `${p.staffId} ${p.date}: ${w}분`);
    }
  }
  assert.equal(working, 1);
});

test("근로계약 — 시급이 최저임금 이상이고 직원마다 하나씩", () => {
  const b = loadDemo();
  const minWage = b.settings?.minWage ?? 0;
  assert.ok(minWage > 0);
  const ids = new Set(b.roster.staff.map((s) => s.id));
  for (const c of b.contracts) {
    assert.ok(ids.has(c.staffId), `${c.staffId} 는 직원 명단에 없다`);
    assert.ok(c.hourlyWage >= minWage, `${c.staffId} 시급 ${c.hourlyWage} < 최저 ${minWage}`);
    assert.ok(c.workDays.length >= 1 && c.workDays.length <= 6);
  }
  assert.equal(b.contracts.length, b.roster.staff.length);
});

test("근무표 배정값은 시드의 조 이름 셋 중 하나거나 휴무(빈 문자열)다", () => {
  const b = loadDemo();
  const names = new Set(["제빵", "오픈조", "마감조", ""]);
  for (const byDate of Object.values(b.roster.assign)) {
    for (const v of Object.values(byDate)) assert.ok(names.has(v), `모르는 조 ${v}`);
  }
});

test("날짜 — 매출은 기준일 이전, 점검 기록은 기준일 이하 (미래면 「여유 있음」 거짓말이 된다)", () => {
  const b = loadDemo();
  for (const [d, row] of Object.entries(b.sales ?? {})) {
    assert.ok(d < BASE_DAY, `매출 ${d}`);
    assert.equal(row.date, d);
    assert.ok(row.total > 0 && row.count > 0 && row.material > 0 && row.material < row.total);
  }
  for (const [id, d] of Object.entries(b.cycleDone ?? {})) {
    assert.ok(d <= BASE_DAY, `점검 ${id} ${d}`);
    assert.ok(b.cycleEvery?.[id], `점검 ${id} 주기 없음`);
  }
  // 기록 없는 항목 하나(c-8)는 주기만 있고 기록이 없다 — 「지금 해야 할 것」 시연용
  assert.equal(b.cycleDone?.["c-8"], undefined);
  assert.ok(b.cycleEvery?.["c-8"]);
});

test("발주 연결은 실제 거래처를 가리킨다", () => {
  const b = loadDemo();
  const vendorIds = new Set((b.vendors?.vendors ?? []).map((v) => v.id));
  for (const [task, vid] of Object.entries(b.orderLinks ?? {})) {
    assert.ok(vendorIds.has(vid), `${task} → ${vid} 없는 거래처`);
  }
});
