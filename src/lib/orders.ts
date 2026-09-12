/* ------------------------------------------------------------------ *
 * 발주 체크.
 *
 * 발주 목록을 새로 만들지 않는다. 프렙에 이미 kind:"order" 항목이 있고
 * (`CLAUDE.md` — "오더는 프렙의 상류다"), 거래처에 마감 시각과 배송 요일이
 * 있다. 여기서 하는 일은 셋뿐이다.
 *
 *   1) 프렙의 발주 항목에 거래처를 이어준다
 *   2) 그날 "주문했다 / 들어왔다"를 남긴다
 *   3) 주문 문구를 만들어 준다 (전화·카톡 둘 다 쓴다)
 *
 * ★ 2번의 두 단계가 핵심이다. 종이 체크리스트는 "주문함"까지만 적는다.
 *   그런데 사고는 대개 **주문은 했는데 안 들어온 것**을 아침에 모르는
 *   데서 난다. 두 칸으로 나누면 그게 눈에 남는다.
 * ------------------------------------------------------------------ */

import { loadJson, saveJson } from "./store.ts";

export type OrderState = {
  /** 주문을 넣었다 */
  ordered: boolean;
  /** 물건이 들어왔다 */
  received: boolean;
  /** 몇 개 주문했는지 — 사람이 읽는 문장으로 둔다 ("우유 12팩") */
  memo: string;
};

/** `log[날짜][프렙항목id] = 상태` */
export type OrderLog = Record<string, Record<string, OrderState>>;

/** `link[프렙항목id] = 거래처id` */
export type OrderLinks = Record<string, string>;

const LOG_KEY = "sop:orderLog";
const LINK_KEY = "sop:orderLinks";

export function loadOrderLog(): OrderLog {
  return loadJson<OrderLog>(LOG_KEY, {});
}

export function saveOrderLog(log: OrderLog): boolean {
  return saveJson(LOG_KEY, log);
}

export function loadOrderLinks(): OrderLinks {
  return loadJson<OrderLinks>(LINK_KEY, {});
}

export function saveOrderLinks(links: OrderLinks): boolean {
  return saveJson(LINK_KEY, links);
}

export const EMPTY_STATE: OrderState = {
  ordered: false,
  received: false,
  memo: "",
};

/**
 * 그날 그 항목의 상태. 기록이 없으면 빈 상태.
 *
 * ★ 빈 상태를 **복사해서** 돌려준다. `EMPTY_STATE` 를 그대로 넘기면
 *   호출부에서 `st.ordered = true` 한 줄만 써도 그 뒤 모든 항목의
 *   기본값이 "주문함"으로 바뀐다 — 화면 전체가 조용히 틀어진다.
 *   지금 호출부는 읽기만 하지만(`OrderView.tsx:109,237`), 한 줄로 터지는
 *   종류라 막아둔다.
 */
export function stateOf(log: OrderLog, date: string, taskId: string): OrderState {
  return log[date]?.[taskId] ?? { ...EMPTY_STATE };
}

export function putState(
  log: OrderLog,
  date: string,
  taskId: string,
  patch: Partial<OrderState>,
): OrderLog {
  const cur = stateOf(log, date, taskId);
  return {
    ...log,
    [date]: { ...(log[date] ?? {}), [taskId]: { ...cur, ...patch } },
  };
}

/**
 * 어제 주문했는데 아직 안 들어온 것들.
 *
 * 아침에 이걸 먼저 봐야 한다. 안 들어온 걸 모르고 영업을 시작하면
 * 점심때 재료가 없다.
 */
export function pendingFrom(log: OrderLog, dates: string[]): Array<{
  date: string;
  taskId: string;
  memo: string;
}> {
  const out: Array<{ date: string; taskId: string; memo: string }> = [];
  for (const date of dates) {
    for (const [taskId, st] of Object.entries(log[date] ?? {})) {
      if (st.ordered && !st.received) out.push({ date, taskId, memo: st.memo });
    }
  }
  return out;
}

/** 주문 문구. 전화로 읽어도 되고 카톡에 붙여도 된다 */
export function buildOrderText(
  storeName: string,
  vendorName: string,
  lines: Array<{ name: string; memo: string }>,
): string {
  const out = [`[${storeName}] 발주 요청`];
  if (vendorName) out.push(`${vendorName} 담당자님, 아래와 같이 부탁드립니다.`);
  out.push("");
  for (const l of lines) {
    out.push(`- ${l.name}${l.memo ? ` : ${l.memo}` : ""}`);
  }
  out.push("");
  out.push("확인 후 회신 부탁드립니다. 감사합니다.");
  return out.join("\n");
}

/* ------------------------------------------------------------------ *
 * 문자로 바로 보내기 (2026-09-12, 사장님 요청)
 *
 *   "주문함 누르면 임의로 거래처 만들어서 바로 문자 할 수 있게 했으면."
 *
 *   그 전에는 **발주 문구를 복사해서 다른 앱에 붙여넣어야** 했다.
 *   아침에 한 손으로 하는 일인데 앱을 오가야 하면 결국 전화로 돌아간다.
 * ------------------------------------------------------------------ */

/** 전화번호에서 숫자와 `+` 만 남긴다. `sms:` 는 하이픈·공백을 싫어한다 */
export function telDigits(phone: string): string {
  return (phone || "").replace(/[^\d+]/g, "");
}

/**
 * 문자 앱을 여는 주소.
 *
 * ★ `?body=` 냐 `&body=` 냐가 기기마다 다르다 — iOS 는 예전에 `&` 만 받았고
 *   안드로이드는 `?` 를 쓴다. **`?&body=` 로 쓰면 양쪽이 다 받는다**(빈 질의
 *   문자열 하나가 앞에 붙는 셈이라 안드로이드도 무시하지 않는다).
 *   여기서 틀리면 문자 앱이 **본문 없이** 열리는데, 사람은 그걸 모르고 보낸다.
 *
 * 번호가 없으면 받는 사람 없이 연다 — 본문은 살아 있으니 주소록에서 고르면 된다.
 */
export function smsHref(phone: string, text: string): string {
  return `sms:${telDigits(phone)}?&body=${encodeURIComponent(text)}`;
}
