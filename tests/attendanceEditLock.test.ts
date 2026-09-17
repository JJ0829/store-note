import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/* ------------------------------------------------------------------ *
 * 출퇴근 — **찍는 것은 열고, 찍힌 시각을 고치는 것은 잠근다** (2026-09-17)
 *
 * 왜 이 둘을 나눠야 하나
 *   [출근]·[퇴근] 버튼은 직원이 직접 눌러야 한다. 잠그면 아무도 안 찍는다.
 *   그런데 **찍힌 뒤의 시각 칸**은 2026-09-17 까지 아무나 고칠 수 있었고,
 *   인건비 = 시각 × 시급이다. 직원이 자기 퇴근시각을 늘려 적으면 그대로
 *   돈이 되는데, 버튼과 달리 **누가 고쳤는지 남지도 않는다.**
 *
 *   그래서 이 파일은 **양쪽을 다 지킨다** — 버튼은 열려 있어야 하고
 *   시각 칸은 잠겨 있어야 한다. 한쪽만 검사하면 다음 사람이 반대로 고친다.
 * ------------------------------------------------------------------ */

const FILE = path.join(process.cwd(), "src", "components", "AttendanceView.tsx");
const src = fs.readFileSync(FILE, "utf-8");

test("★ 시각 잠금이 「잠금번호를 안 만든 매장」에서는 안 걸린다", () => {
  assert.match(
    src,
    /const timeLocked = owner\.ready && !owner\.open/,
    "timeLocked 가 owner.ready 와 owner.open 을 같이 보지 않는다",
  );
  /* `useOwnerOpen()` 이 `setOpen(!hasPin() || isUnlocked())` 이므로
     PIN 을 안 만든 매장은 open:true → timeLocked:false 가 된다.
     그 전제가 깨지면 PIN 없는 매장에서 시각을 영영 못 고친다. */
  const gate = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "OwnerGate.tsx"),
    "utf-8",
  );
  assert.match(
    gate,
    /setOpen\(!hasPin\(\) \|\| isUnlocked\(\)\)/,
    "useOwnerOpen 이 「PIN 을 안 만들었으면 안 가린다」를 더 이상 안 한다 — timeLocked 전제가 깨졌다",
  );
});

test("★ 시각 세 칸(출근·퇴근·휴게)이 잠금을 본다", () => {
  const inAt = src.indexOf("{ inAt: e.target.value }");
  const outAt = src.indexOf("{ outAt: e.target.value }");
  const brk = src.indexOf("{ breakMin: v }");
  for (const [name, at] of [["출근", inAt], ["퇴근", outAt], ["휴게", brk]] as const) {
    assert.ok(at > 0, `${name} 시각 칸을 못 찾았다`);
    const around = src.slice(at, at + 420);
    assert.match(
      around,
      /timeLocked/,
      `${name} 칸이 timeLocked 를 안 본다 — 아무나 고칠 수 있다`,
    );
  }
});

test("★ edit() 자체도 막는다 (화면 속성만 믿지 않는다)", () => {
  const at = src.indexOf("function edit(");
  assert.ok(at >= 0, "edit() 를 못 찾았다");
  const body = src.slice(at, at + 500);
  assert.match(
    body,
    /if \(timeLocked\) return/,
    "edit() 안에 잠금 검사가 없다 — 칸을 하나 더 붙이는 사람이 readOnly 를 빼먹으면 조용히 다시 열린다",
  );
  /* 막는 줄이 저장보다 **먼저**여야 한다 */
  assert.ok(
    body.indexOf("if (timeLocked) return") < body.indexOf("commit("),
    "잠금 검사가 commit() 보다 뒤에 있다 — 막기 전에 이미 저장된다",
  );
});

test("★ [출근]·[퇴근] 버튼은 잠그지 않는다 — 직원이 직접 찍는 화면이다", () => {
  const at = src.indexOf("function stamp(");
  assert.ok(at >= 0, "stamp() 를 못 찾았다");
  const body = src.slice(at, src.indexOf("function edit("));
  assert.doesNotMatch(
    body,
    /if \(timeLocked\) return/,
    "stamp() 에 잠금이 붙었다. 직원이 출퇴근을 못 찍으면 이 화면은 쓸모가 없다",
  );
});

test("잠겼을 때 왜 못 고치는지 화면이 말한다", () => {
  assert.match(
    src,
    /찍힌 시각을 고치는 것은 사장님만/,
    "잠긴 이유를 알려주는 문구가 없다 — 직원은 앱이 고장 난 줄 안다",
  );
});
