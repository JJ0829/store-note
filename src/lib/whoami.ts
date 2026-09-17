import { businessDay } from "./businessDay.ts";
import { loadJson, saveJson } from "./store.ts";

/* ------------------------------------------------------------------ *
 * 지금 이 태블릿을 쓰는 사람이 누구인가.
 *
 * ★ 왜 필요했나 (사장님 요청 2026-09-12)
 *   "프렙이랑 발주 체크한 거 기록되게 해줘. 만약에 잘못됐을 때 누가
 *    실수했는지 알 수 있게."
 *
 *   지금까지 체크는 **누가 눌렀는지 없이** 날짜별로만 남았다. 공용 태블릿이라
 *   세 사람이 같은 화면을 누르는데, 콜드브루를 아무도 시작 안 했어도 **아무도 모른다** —
 *   체크는 돼 있는데 물건이 없는 상태가 되고, 그러면 다음부터 아무도 체크를
 *   안 믿는다. 기록이 믿기지 않으면 없는 것과 같다.
 *
 * ⚠️ **책임을 묻는 장치가 아니라 되짚는 장치다.** 그래서
 *   ① 이름은 근무표에 있는 사람 중에서 고른다 (새로 타이핑하지 않는다)
 *   ② **영업일이 바뀌면 잊는다** — 어제 사람이 오늘 체크의 주인이 되면 안 된다
 *   ③ 언제든 바꿀 수 있다. 잠그지 않는다 — 잠그면 바쁠 때 그냥 남의 이름으로 누른다
 * ------------------------------------------------------------------ */

const KEY = "sop:whoami";

export type WhoAmI = {
  /** 근무표 직원 id */
  staffId: string;
  /** 화면에 그대로 보여줄 이름 (직원이 지워져도 기록은 남아야 한다) */
  name: string;
  /** 어느 영업일에 고른 것인가 */
  day: string;
};

/**
 * 지금 고른 사람. **오늘 영업일에 고른 것만** 돌려준다.
 *
 * 날짜 비교를 빼먹으면 어제 마감조가 오늘 아침 오픈조의 체크에 이름을 남긴다.
 */
export function loadWho(now: Date = new Date()): WhoAmI | null {
  const w = loadJson<WhoAmI | null>(KEY, null);
  if (!w || typeof w.staffId !== "string" || typeof w.name !== "string") return null;
  return w.day === businessDay(now) ? w : null;
}

export function saveWho(
  staffId: string,
  name: string,
  now: Date = new Date(),
): boolean {
  return saveJson(KEY, { staffId, name, day: businessDay(now) });
}

export function clearWho(): boolean {
  return saveJson(KEY, null);
}

/* ------------------------------------------------------------------ *
 * 누가 · 언제 눌렀는가
 * ------------------------------------------------------------------ */

export type Mark = {
  /** 눌렀을 때 고른 사람 이름. 안 골랐으면 빈 문자열 */
  who: string;
  /** "14:32" — 초는 안 남긴다. 되짚는 데 분이면 충분하다 */
  at: string;
};

/** 한 목록의 그날 기록 — `{ 항목id: {who, at} }` */
export type MarkLog = Record<string, Mark>;

/**
 * 기록 키.
 *
 * ★ 체크 상태(`sop:prep:{slug}:{영업일}`)와 **따로 둔다.**
 *   체크는 영업일이 지나면 지워지지만 **기록은 남겨야** 되짚을 수 있다.
 *   같은 키에 얹으면 다음 날 아침에 어제 일을 못 본다.
 */
export function markKey(scope: string, day: string): string {
  return `sop:mark:${scope}:${day}`;
}

export function loadMarks(scope: string, day: string): MarkLog {
  const m = loadJson<MarkLog>(markKey(scope, day), {});
  return m && typeof m === "object" ? m : {};
}

export function saveMarks(scope: string, day: string, log: MarkLog): boolean {
  return saveJson(markKey(scope, day), log);
}

/** 지금 시각 "HH:MM" */
export function hhmm(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * 한 건을 남긴다. **끌 때는 지운다** — 껐는데 이름이 남아 있으면
 * "이 사람이 했다" 는 거짓말이 된다.
 */
export function mark(
  log: MarkLog,
  taskId: string,
  on: boolean,
  who: string,
  now: Date = new Date(),
): MarkLog {
  if (!on) {
    const next = { ...log };
    delete next[taskId];
    return next;
  }
  return { ...log, [taskId]: { who, at: hhmm(now) } };
}
