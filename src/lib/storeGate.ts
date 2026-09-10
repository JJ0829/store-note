/* ------------------------------------------------------------------ *
 * 매장 잠금 — 레시피용.
 *
 * ★ 사장님 잠금(`ownerGate.ts`)과 **다른 것이다. 헷갈리면 제품이 망가진다.**
 *
 *   | | 아는 사람 | 가리는 것 | 왜 |
 *   |---|---|---|---|
 *   | 사장님 PIN | 사장님만 | 매출·시급·단가·계약 | 직원이 동료 시급을 보면 안 된다 |
 *   | **매장 PIN** | **직원 전부** | **레시피** | **링크가 새도 매장 밖 사람은 못 열게** |
 *
 * 레시피에 사장님 PIN을 걸면 안 된다. 레시피는 **직원이 매일 여는 화면**이라
 * 사장님만 아는 번호로 잠그면 아무도 못 쓴다. 막으려는 상대가 다르다 —
 * 여기서 막는 건 동료가 아니라 **카톡으로 링크를 건네받은 매장 밖 사람**이다.
 *
 * 화면이 이미 사용자에게 약속해둔 것이기도 하다:
 *   `src/app/r/page.tsx` — "매장 PIN 잠금은 배포 전에 붙입니다"
 *
 * ⚠⚠ 이것은 **가림막이고, 사장님 잠금보다도 약하다. 과장해서 말하지 말 것.**
 *
 *   사장님 잠금이 가리는 값(매출·시급)은 localStorage에 있어서 브라우저 안에만
 *   있다. 그런데 **레시피는 서버 컴포넌트가 HTML에 실어 보낸다.** 그래서
 *   잠긴 상태에서도 페이지 소스에 재료와 계량이 그대로 들어 있다.
 *   실측(2026-09-07): `curl localhost:3000/r/shokupan | grep 강력분` → 나온다.
 *
 *   즉 막아지는 것은 **"브라우저로 열었을 때 화면에 안 보이는 것"까지**이고,
 *   소스를 보는 사람은 못 막는다. 서버가 없으면 이보다 더 못 막는다 —
 *   데이터를 안 보내려면 보낼지 말지 판단하는 서버가 있어야 하기 때문이다.
 *
 *   그래도 두는 이유: 링크를 잘못 받은 사람 대부분은 소스를 안 본다.
 *   화면 문구도 여기에 맞춰 "가림막"이라고 적었다(`src/app/r/page.tsx`).
 *   **진짜 차단은 서버(Supabase RLS)다.** → `docs/deliverables/06_보안설계.md`
 *
 * 두 가지를 사장님 잠금과 똑같이 지킨다.
 *   1) PIN을 평문으로 저장하지 않는다 (`pinDigest.ts`, 소금은 다르게)
 *   2) 열린 상태는 sessionStorage — 브라우저를 닫으면 다시 잠긴다
 * ------------------------------------------------------------------ */

import { digest as pinDigest } from "./pinDigest.ts";
import { isUnlocked as ownerUnlocked } from "./ownerGate.ts";

const PIN_KEY = "sop:storePin";
const OPEN_KEY = "sop:storeOpen";

function digest(pin: string): string {
  return pinDigest("sop-store", pin);
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
 * 사람은 개발자 도구로 그냥 본다(`06_보안설계.md` V-19 · 서버가 HTML 에 재료를 실어 보내기까지 한다). 그런 잠금에
 * "현재 번호를 대야 바꿔준다" 를 붙이면 **막지도 못하면서 사장님만 가둔다.**
 *
 * 실제로 가두는 것이 무엇인지가 문제다 — 사장님이 직접 넣은 레시피(`sop:recipes`)가 이 잠금 뒤에 있다.
 * 번호를 잊으면 **그 레시피를 다시 볼 방법이 없어진다** — 유일한 사본이
 * 이 브라우저 저장소다(`01_MVP기획서.md` §6.5.1).
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

/**
 * 열려 있는가.
 *
 * **사장님 잠금이 풀려 있으면 레시피도 열어준다.** 사장님한테 번호를 두 개
 * 외우게 하면 둘 다 안 쓴다. 반대 방향은 열지 않는다 — 매장 PIN을 안다고
 * 매출까지 보이면 그건 사장님 잠금이 없는 것과 같다.
 */
export function isUnlocked(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_KEY) === "1") return true;
  } catch {
    /* 아래에서 사장님 쪽을 한 번 더 본다 */
  }
  return ownerUnlocked();
}

/** PIN을 아직 안 만들었으면 잠그지 않는다 — 첫 사용자를 가두면 안 된다 */
export function needsPin(): boolean {
  return hasPin() && !isUnlocked();
}
