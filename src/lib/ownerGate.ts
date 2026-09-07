/* ------------------------------------------------------------------ *
 * 사장님 영역 잠금.
 *
 * ⚠ 먼저 분명히 해둘 것: **이건 보안이 아니라 가리개다.**
 *
 * 태블릿을 가진 사람이 개발자도구를 열면 localStorage를 그대로 읽는다.
 * PIN 검사도 브라우저 안에서 돈다. 그러니 이걸로 막히는 건
 * "홀 직원이 태블릿 만지다가 매출·급여 화면을 열어보는 것"까지다.
 * 그 정도만 해도 지금 필요한 건 맞다 — 매출·시급·계약 조건이
 * 공용 태블릿 첫 화면에 그냥 있으면 안 되니까.
 *
 * 진짜 접근 통제는 서버(Supabase Row Level Security)로 가야 하고,
 * 그건 배포 작업이다. `docs/deliverables/06_보안설계.md` 참조.
 *
 * 두 가지를 지킨다.
 *   1) PIN을 평문으로 저장하지 않는다 (그래도 복호화는 아니고 단방향)
 *   2) 잠금 해제는 sessionStorage에 둔다 — 브라우저를 닫으면 다시 잠긴다.
 *      공용 태블릿이라 localStorage에 두면 영영 열린 채로 남는다.
 * ------------------------------------------------------------------ */

import { digest as pinDigest } from "./pinDigest.ts";

const PIN_KEY = "sop:ownerPin";
const OPEN_KEY = "sop:ownerOpen";

/**
 * 소금은 `sop-owner` 그대로 둔다.
 *
 * 계산 자체는 `pinDigest.ts`로 옮겼지만(매장 PIN과 공유),
 * **소금을 바꾸면 이미 태블릿에 저장된 사장님 PIN이 안 맞게 된다.**
 * 사장님은 다시 만들 수밖에 없고, 그 사이 매출 화면이 열린 채로 남는다.
 */
function digest(pin: string): string {
  return pinDigest("sop-owner", pin);
}

export function hasPin(): boolean {
  try {
    return !!localStorage.getItem(PIN_KEY);
  } catch {
    return false;
  }
}

export function setPin(pin: string): boolean {
  try {
    if (pin.length < 4) return false;
    localStorage.setItem(PIN_KEY, digest(pin));
    unlock();
    return true;
  } catch {
    return false;
  }
}

export function checkPin(pin: string): boolean {
  try {
    const saved = localStorage.getItem(PIN_KEY);
    if (!saved) return false;
    return saved === digest(pin);
  } catch {
    return false;
  }
}

export function unlock(): void {
  try {
    sessionStorage.setItem(OPEN_KEY, "1");
  } catch {
    /* 사생활 보호 모드 — 화면은 계속 쓸 수 있어야 한다 */
  }
}

export function lock(): void {
  try {
    sessionStorage.removeItem(OPEN_KEY);
  } catch {
    /* 무시 */
  }
}

export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** PIN을 아직 안 만들었으면 잠그지 않는다 — 첫 사용자를 가두면 안 된다 */
export function needsPin(): boolean {
  return hasPin() && !isUnlocked();
}
