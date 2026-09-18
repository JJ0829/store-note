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
    /* ★ 앞쪽도 본다 (2026-09-18).
       전에는 표시 지점에서 **뒤로만** 420자를 봤다. 그런데 휴게 칸은
       `if (!timeLocked) edit(s.id, { breakMin: v })` 라 잠금 검사가
       표시 지점보다 **앞**에 있다. 그때는 뒤쪽 420자 안에 마침
       잠금 안내 문구가 들어와서 통과했을 뿐이고, 그 사이에 주석 한 덩이가
       들어오자 바로 깨졌다 — **막는 코드가 아니라 거리가 검사되고 있었다.**
       칸 가까이에 검사가 있는지를 보는 것이 목적이므로 양쪽을 다 본다. */
    const around = src.slice(Math.max(0, at - 240), at + 420);
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
  /* ★ 2026-09-18 — 이 검사는 **주석을 읽고 통과하고 있었다.**
     같은 문장이 위쪽 설명 주석에도 있어서, 화면 문구를 지워도 초록이었다.
     그래서 화면에 실제로 그려지는 꼴(`<p …>` 안)로 못 박는다. */
  const 안내 = src.match(
    /찍힌 시각을 고치거나 지우는 것은 사장님만 합니다\.[\s\S]{0,120}?잠금번호를 넣으면/,
  );
  assert.ok(안내, "잠긴 이유를 알려주는 문구가 없다 — 직원은 앱이 고장 난 줄 안다");
  const at = src.indexOf(안내[0]);
  const before = src.slice(Math.max(0, at - 300), at);
  assert.ok(
    before.includes("timeLocked && ("),
    "안내 문구가 잠겼을 때만 뜨는 자리에 없다",
  );
});

/* ------------------------------------------------------------------ *
 * 잘못 찍은 기록 지우기 (2026-09-18 · 사장님 요청)
 * ------------------------------------------------------------------ */

test("★ 지우기는 사장님만 — 직원이 자기 지각을 없던 일로 못 만든다", () => {
  const at = src.indexOf("removePunch(s)");
  assert.ok(at > 0, "지우기 버튼을 못 찾았다");
  const before = src.slice(Math.max(0, at - 300), at);
  assert.match(
    before,
    /!timeLocked && \(/,
    "지우기 버튼이 잠금 밖에 있다 — 직원이 자기 기록을 지울 수 있다",
  );
});

test("★★ 지우기는 서버에서도 지운다 — 덮어쓰기로는 안 없어진다", () => {
  /* `commit()` 은 upsert 라 서버 줄이 그대로 남는다. 그 길로 지우면
     다른 기기에서 열 때 **지운 기록이 되살아난다.** 실제로 그런 적이 있다
     (2026-09-15 거래처 삭제). 그래서 지우기만 `deleteRows` 를 쓴다. */
  const at = src.indexOf("function removePunch(");
  assert.ok(at > 0, "removePunch() 를 못 찾았다");
  const body = src.slice(at, at + 1800);
  assert.match(body, /deleteRows\("punches"/, "서버에서 안 지운다");
  assert.match(body, /savePunches\(next\)/, "태블릿에서 안 지운다");
  assert.doesNotMatch(
    body,
    /commit\(/,
    "commit() 을 쓴다 — 그쪽은 덮어쓰기라 서버 줄이 남는다",
  );
  assert.match(body, /confirm\(/, "확인 없이 지운다 — 잘못 누르면 급여가 틀린다");
});
