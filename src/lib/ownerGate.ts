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

/**
 * ★ 번호를 잊었을 때 새로 정한다 (2026-09-10).
 *
 * **왜 현재 번호를 안 묻는가.** 이 잠금은 처음부터 **가림막**이다 —
 * 검사가 브라우저 안에서 돌고 데이터는 저장소에 그대로 있어서, 기기를 가진
 * 사람은 개발자 도구로 그냥 본다(`06_보안설계.md` V-19). 그런 잠금에
 * "현재 번호를 대야 바꿔준다" 를 붙이면 **막지도 못하면서 사장님만 가둔다.**
 *
 * 실제로 가두는 것이 무엇인지가 문제다 — `/backup` 이 잠겨 있고,
 * 거기에 **근로기준법 제42조가 3년 보존을 요구하는 출퇴근·근로계약**이 있다.
 * 번호를 잊으면 그 데이터를 꺼낼 방법이 없어진다.
 * **가용성 결함이 법정 의무 위반으로 이어지는 자리다**
 * (`01_MVP기획서.md` §10.3 (다) #17).
 *
 * 그래서 재설정을 연다. 대신 **화면이 그 뜻을 정직하게 말한다** —
 * "이 태블릿을 만질 수 있는 사람은 누구나 새로 정할 수 있습니다."
 * 없는 안전을 광고하지 않는 것이 이 프로젝트의 규칙이다.
 *
 * ⚠️ 데이터는 **안 지운다.** 번호만 바꾼다.
 */
export function resetPin(next: string): boolean {
  if (next.length < 4) return false;
  return setPin(next);
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
