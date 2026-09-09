/* ------------------------------------------------------------------ *
 * 주기 점검 — 마지막으로 한 날
 *
 * ★ 이 파일이 고치는 문제 (2026-09-08 발견)
 *
 *   주기 점검 체크가 `prep:cycle:{영업일}` 에 저장돼서 **다음 날 지워졌다.**
 *   정수 필터를 오늘 갈고 체크해도 내일 열면 안 한 상태였다.
 *
 *       2026-09-08  정수 필터 교체 ✅   → prep:cycle:2026-09-08
 *       2026-09-09  체크가 없다        → prep:cycle:2026-09-09 (빈 키)
 *
 *   `4개월마다` 라고 적혀 있었지만 **앱은 그 4개월을 세지 않았다.**
 *   `day-flow.md` 는 이 항목들을 이렇게 설명한다 —
 *   *"며칠 걸러도 티가 안 납니다. 그래서 아무도 기억 못 합니다."*
 *   **기억을 대신하는 것이 그 화면의 존재 이유인데 그걸 못 하고 있었다.**
 *
 * ★ 그래서 저장하는 것이 다르다
 *
 *   체크리스트·프렙 : `prep:{slug}:{영업일}` — **그날 체크**. 영업일이 바뀌면 지운다
 *   주기 점검       : `sop:cycleDone`      — **마지막으로 한 날**. 절대 안 지운다
 *
 *   접두사를 `prep:` 이 아니라 `sop:` 으로 둔 것도 그래서다.
 *   `pruneDayKeys()` 는 `{접두사}{YYYY-MM-DD}` 꼴만 지우므로 이 키는 안 걸린다
 *   (`sop:punch` 와 같은 이유. tests/businessDay.test.ts 가 못 박아뒀다).
 *
 * ⚠️ 보건증·소방·위생교육은 **점검 기록 자체가 증빙**이 된다.
 *   내보내기(`/backup`)에 넣을지는 아직 결정 안 했다 → 21_화면명세 §7-⑧
 * ------------------------------------------------------------------ */

import { businessDay } from "./businessDay.ts";
import { loadJson, saveJson } from "./store.ts";

/** `{ "c-1": "2026-05-11" }` — 항목 id → 마지막으로 한 영업일 */
export type CycleDone = Record<string, string>;

const KEY = "sop:cycleDone";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function loadCycleDone(): CycleDone {
  const raw = loadJson<Record<string, unknown>>(KEY, {});
  const out: CycleDone = {};
  // 값이 깨져 있으면 버린다. 날짜가 아닌 것이 들어오면 아래 계산이 전부 NaN 이 된다
  for (const [id, v] of Object.entries(raw)) {
    if (typeof v === "string" && YMD.test(v)) out[id] = v;
  }
  return out;
}

export function saveCycleDone(data: CycleDone): boolean {
  return saveJson(KEY, data);
}

/** 오늘 했다고 기록한다. 이미 오늘 것이면 지운다(잘못 누른 것을 되돌린다) */
export function toggleDone(
  data: CycleDone,
  id: string,
  day: string = businessDay(),
): CycleDone {
  const next = { ...data };
  if (next[id] === day) delete next[id];
  else next[id] = day;
  return next;
}

/** 며칠 지났는가. 기록이 없으면 `null` */
export function daysSince(
  data: CycleDone,
  id: string,
  day: string = businessDay(),
): number | null {
  const last = data[id];
  if (!last) return null;
  return diffDays(last, day);
}

/**
 * 다음 점검까지 남은 날. 음수면 그만큼 지났다.
 *
 * 기록이 없으면 `null` — **0 이나 큰 수로 채우지 않는다.**
 * 0 으로 채우면 "오늘 해야 함"으로 보이고, 큰 수로 채우면 "아직 여유 있음"으로
 * 보인다. 둘 다 거짓이다. 모른다는 것을 화면이 그대로 말해야 한다.
 */
export function daysLeft(
  data: CycleDone,
  id: string,
  everyDays: number,
  day: string = businessDay(),
): number | null {
  const since = daysSince(data, id, day);
  if (since === null) return null;
  return everyDays - since;
}

/** 화면에 그대로 쓰는 문장. `null` 이면 아직 기록이 없다는 뜻 */
export function leftLabel(left: number | null): string {
  if (left === null) return "기록 없음 — 언제 했는지 모릅니다";
  if (left < 0) return `${-left}일 지났습니다`;
  if (left === 0) return "오늘까지입니다";
  return `${left}일 남음`;
}

/** `2026-05-11` → `5/11` */
export function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[2])}/${Number(m[3])}`;
}

/**
 * 급한 것부터. 기록 없는 것이 **맨 앞**이다.
 *
 * 기록이 없으면 언제 했는지 모르는 것이고, 모르는 것이 가장 위험하다 —
 * 소화기 점검을 3년 전에 했는지 어제 했는지 모르는 상태가 그렇다.
 * 뒤로 밀면 사장님이 영영 안 채운다.
 */
export function sortByUrgency<T extends { id: string; everyDays: number }>(
  items: T[],
  data: CycleDone,
  day: string = businessDay(),
): T[] {
  return [...items].sort((a, b) => {
    const la = daysLeft(data, a.id, a.everyDays, day);
    const lb = daysLeft(data, b.id, b.everyDays, day);
    if (la === null && lb === null) return a.everyDays - b.everyDays;
    if (la === null) return -1;
    if (lb === null) return 1;
    if (la !== lb) return la - lb;
    return a.everyDays - b.everyDays;
  });
}

/* ------------------------------------------------------------------ */

/**
 * `YYYY-MM-DD` 두 개의 날짜 차이 (일). `b - a`
 *
 * 정오를 기준으로 만든다 — 자정으로 만들면 서머타임이 있는 지역에서
 * 하루가 23시간이 되어 반내림으로 1일이 사라진다. 한국은 서머타임이 없지만
 * `businessDay()`·`recentDays()` 가 같은 이유로 정오를 쓰고 있어서 맞춰둔다.
 */
function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}
