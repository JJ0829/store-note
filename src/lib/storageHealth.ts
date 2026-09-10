/* ------------------------------------------------------------------ *
 * 저장소가 살아 있는가.
 *
 * ★ 왜 필요한가 — **개별 저장 실패 알림으로는 못 잡는 구멍이 있다.**
 *
 *   `21_화면명세` §7-① 이 정한 기준은 이렇다.
 *     · 나중에 다시 읽어야 하는 기록(출퇴근·계약·거래처·매출·근무표·설정·발주)
 *       → 실패를 **반드시** 알린다
 *     · 체크리스트·프렙처럼 그날 지나면 지워질 것 → **일부러 조용하다**
 *
 *   이 기준은 맞다. 그런데 **저장소가 통째로 죽어 있으면** 이야기가 다르다.
 *   시크릿 모드나 "사이트 데이터 차단" 이면 *모든* 쓰기가 실패하는데,
 *   아침에 오픈 체크리스트를 켜고 프렙을 찍는 동안은 **조용한 쪽만 쓴다.**
 *   그래서 사장님은 마감에 매출을 넣다가 처음 알게 된다 — 그때는 이미
 *   하루치 체크가 통째로 없다.
 *
 *   그래서 여기서는 **개별 저장이 아니라 환경을 한 번 진단한다.**
 *   §7-① 과 충돌하지 않는다. 저 기준은 "이 값이 안 남았다" 를 말하는 것이고,
 *   이건 "이 기기는 아무것도 못 남긴다" 를 말하는 것이다.
 *
 * ⚠️ 여기서 하는 것은 **진단뿐**이다. 고치는 방법은 사람 손에 있다
 *   (시크릿 모드를 끄거나, 백업을 받고 오래된 기록을 정리하거나).
 * ------------------------------------------------------------------ */

/** 진단용으로 썼다 지우는 키. `sop:` 접두사를 쓰지 않는다 — 백업 목록과 섞이면 안 된다 */
const CANARY = "__store-note-probe__";

export type StorageHealth =
  /** 읽고 쓸 수 있다 */
  | { state: "ok" }
  /**
   * 저장 자체가 막혀 있다 — 시크릿 모드, 사이트 데이터 차단, 쿠키 차단.
   * **이미 저장된 것도 없다.** 오늘 입력한 것은 새로고침하면 사라진다.
   */
  | { state: "blocked" }
  /**
   * 쓸 공간이 없다. **읽기는 된다** — 지금까지 넣은 것은 무사하다.
   * 지금부터 넣는 것이 안 남는다.
   */
  | { state: "full" };

/**
 * 앱이 **실제로 쓰는 만큼** 써 보고 판단한다.
 *
 * ★ 1바이트로 재면 안 된다 (2026-09-10 브라우저 실측에서 드러났다).
 *   이 앱은 덩이를 통째로 쓴다 — `sop:punch` 하나가 수백 KB 다.
 *   저장소가 거의 찼을 때 **1바이트는 들어가고 출퇴근 전체는 안 들어간다.**
 *   그 상태에서 "ok" 라고 하면 정확히 우리가 없애려던 **거짓 안심**이 된다.
 *   그래서 canary 를 **지금 가장 큰 덩이만큼** 잡는다. 이게 통과하면
 *   "다음 저장이 들어갈 자리는 있다" 를 말할 수 있다.
 *
 * ★ 던지는 예외 이름으로는 판단하지 않는다. 브라우저마다 다르고
 *   (`QuotaExceededError` · `NS_ERROR_DOM_QUOTA_REACHED` · 코드 22 · 1014),
 *   사파리는 시크릿 모드에서도 용량 초과를 던진 적이 있다.
 *   **대신 "이미 넣어둔 것을 읽을 수 있는가" 로 가른다** — 읽히면 저장소는
 *   살아 있고 공간만 없는 것이고, 안 읽히면 저장소가 통째로 막힌 것이다.
 */
export function probeStorage(): StorageHealth {
  try {
    // 읽기 자체가 던지면 저장소가 통째로 막힌 것이다
    localStorage.getItem(CANARY);
  } catch {
    return { state: "blocked" };
  }

  try {
    localStorage.setItem(CANARY, "x".repeat(canarySize()));
    return { state: "ok" };
  } catch {
    /* 쓰기만 실패했다. 읽기가 되고 이미 넣어둔 것이 있으면 "공간 없음",
       아무것도 없으면 애초에 못 쓰는 기기다 */
    let hasData = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i)?.startsWith("sop:")) {
          hasData = true;
          break;
        }
      }
    } catch {
      return { state: "blocked" };
    }
    return hasData ? { state: "full" } : { state: "blocked" };
  } finally {
    // 성공하든 실패하든 반드시 치운다. 남으면 그 자체가 공간을 먹는다
    try {
      localStorage.removeItem(CANARY);
    } catch {
      /* 지우지도 못하는 상태면 위에서 이미 blocked 로 답했다 */
    }
  }
}

/**
 * 다음 저장이 얼마나 클 것인가.
 *
 * 지금 들어 있는 것 중 **가장 큰 덩이**를 기준으로 잡는다. 다음에 그 덩이를
 * 다시 쓸 때가 가장 큰 쓰기이기 때문이다. 아직 아무것도 없는 기기에서는
 * 최소치(16KB)를 쓴다 — 너무 작게 잡으면 위의 거짓 안심으로 돌아간다.
 */
function canarySize(): number {
  const MIN = 16 * 1024;
  let max = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sop:")) continue;
      max = Math.max(max, (localStorage.getItem(k) ?? "").length);
    }
  } catch {
    return MIN;
  }
  return Math.max(MIN, max);
}

/** 사람이 읽는 한 줄. 화면이 그대로 띄운다 */
export function healthMessage(h: StorageHealth): string | null {
  switch (h.state) {
    case "ok":
      return null;
    case "blocked":
      return (
        "이 브라우저는 기록을 저장하지 못합니다. " +
        "지금 입력하는 출퇴근·매출·체크는 새로고침하면 사라집니다. " +
        "시크릿 모드를 끄거나, 브라우저 설정에서 이 사이트의 데이터 저장을 허용해 주세요."
      );
    case "full":
      return (
        "저장 공간이 찼습니다. 지금까지 넣은 것은 무사하지만 " +
        "지금부터 입력하는 것이 안 남습니다. 먼저 전체 백업을 받아 두세요."
      );
  }
}

/* ------------------------------------------------------------------ *
 * 얼마나 찼는가
 *
 * 브라우저는 남은 용량을 안 알려준다. 그래서 **우리가 넣은 것의 크기**를
 * 재서 보여준다. 한계(보통 5MB)는 브라우저마다 달라 단정하지 않는다.
 *
 * 무엇이 자라는가 — `sop:punch`(직원 × 날짜) · `sop:sales`(날짜) ·
 * `sop:orderLog`(날짜 × 항목) 셋은 **지우는 경로가 없어서 계속 자란다.**
 * 나머지는 한 번 넣고 두는 것이라 크기가 고정이다.
 * ------------------------------------------------------------------ */

export type UsageRow = { key: string; bytes: number };

/**
 * `sop:` 키가 실제로 쓰는 바이트.
 *
 * UTF-16 로 저장되므로 글자 수 × 2 로 센다. 키 이름도 공간을 차지한다.
 * 정확한 값은 브라우저만 알지만, **어느 덩이가 큰지** 를 보는 데는 충분하다.
 */
export function storageUsage(): { total: number; rows: UsageRow[] } {
  const rows: UsageRow[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sop:")) continue;
      const v = localStorage.getItem(k) ?? "";
      rows.push({ key: k, bytes: (k.length + v.length) * 2 });
    }
  } catch {
    return { total: 0, rows: [] };
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return { total: rows.reduce((s, r) => s + r.bytes, 0), rows };
}

/** `1.2MB` · `340KB` · `12B` */
export function bytesLabel(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

/** 저장 키를 사람이 읽는 이름으로. 화면이 그대로 쓴다 */
export const KEY_LABEL: Record<string, string> = {
  "sop:roster": "직원 · 근무표",
  "sop:punch": "출퇴근 기록",
  "sop:contracts": "근로계약",
  "sop:cycleDone": "점검 기록",
  "sop:cycleEvery": "점검 주기",
  "sop:sales": "매출",
  "sop:vendors": "거래처 · 단가",
  "sop:settings": "설정",
  "sop:recipes": "내 레시피",
  "sop:orderLog": "발주 기록",
  "sop:orderLinks": "발주 거래처 연결",
};

/**
 * 계속 자라는 키. **지우는 경로가 없다.**
 *
 * 출퇴근은 직원 × 날짜로, 매출은 날짜로, 발주는 날짜 × 항목으로 쌓인다.
 * 근로기준법이 3년 보존을 요구하므로 함부로 지울 수도 없다 —
 * 그래서 지금 할 수 있는 것은 **얼마나 찼는지 보여주는 것**까지다.
 * 한계에 닿으면 출퇴근을 못 찍게 되는데, 그때 알면 늦는다.
 */
export const GROWING_KEYS = ["sop:punch", "sop:sales", "sop:orderLog"] as const;
