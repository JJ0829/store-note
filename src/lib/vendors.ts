/* ------------------------------------------------------------------ *
 * 거래처와 품목 단가.
 *
 * 이 파일이 두 화면의 뿌리다.
 *   - 발주체크: 오늘 어디에 몇 시까지 주문해야 하는가
 *   - 원가:     레시피 재료 1g이 얼마인가
 *
 * `CLAUDE.md`의 "오더는 프렙의 상류다"를 뒤집어 놓은 것이다.
 * 프렙에 이미 kind:"order" 항목이 있으므로 발주 목록을 새로 만들지 않고,
 * 그 항목에 거래처를 붙이기만 한다.
 * ------------------------------------------------------------------ */

import { loadJson, newId, saveJson } from "./store.ts";
import { convert } from "./units.ts";

export type Vendor = {
  id: string;
  name: string;
  /** 전화번호. 주방에서 바로 누를 수 있게 tel: 링크로 건다 */
  phone: string;
  /** 담당자 이름 */
  contact: string;
  /** 주문 방법 — 전화 / 카톡 / 앱 / 홈페이지 */
  how: string;
  /** 주문 마감 시각 "15:00". 이걸 넘기면 다음 날로 밀린다 */
  cutoff: string;
  /**
   * 배송 요일 (0=일 … 6=토). 비어 있으면 "매일".
   * 금요일에 주말치까지 몰아 주문하는 이유가 여기 있다 —
   * 일요일 배송을 하는 거래처가 거의 없다.
   */
  deliverDays: number[];
  /** 주문 후 며칠 뒤 오는가 */
  leadDays: number;
  note: string;
};

/**
 * 거래처가 파는 품목 하나.
 *
 * `name`이 레시피 재료명과 **글자 그대로 같아야** 원가가 붙는다.
 * 자동으로 비슷한 이름을 이어주면 "우유"와 "멸균우유"를 같은 것으로
 * 봐서 원가가 틀린다. 그래서 화면에서 직접 고르게 한다.
 */
export type VendorItem = {
  id: string;
  vendorId: string;
  name: string;
  /** 한 번에 사는 단위 수량 — 우유 1000ml 한 팩이면 1000 */
  packAmount: number;
  /** 그 수량의 단위 — ml */
  packUnit: string;
  /** 그 한 팩의 값 (원, 부가세 포함가로 넣는다) */
  packPrice: number;
  note: string;
};

export type VendorData = {
  vendors: Vendor[];
  items: VendorItem[];
};

const KEY = "sop:vendors";

export function loadVendors(): VendorData {
  const d = loadJson<Partial<VendorData>>(KEY, {});
  return {
    vendors: Array.isArray(d.vendors) ? d.vendors : [],
    items: Array.isArray(d.items) ? d.items : [],
  };
}

export function saveVendors(data: VendorData): boolean {
  return saveJson(KEY, data);
}

export function newVendor(): Vendor {
  return {
    id: newId("vd"),
    name: "",
    phone: "",
    contact: "",
    how: "전화",
    cutoff: "15:00",
    deliverDays: [1, 2, 3, 4, 5, 6],
    leadDays: 1,
    note: "",
  };
}

export function newVendorItem(vendorId: string): VendorItem {
  return {
    id: newId("vi"),
    vendorId,
    name: "",
    packAmount: 0,
    packUnit: "g",
    packPrice: 0,
    note: "",
  };
}

export const HOW_OPTIONS = ["전화", "카톡", "앱", "홈페이지", "방문"];

/* ------------------------------------------------------------------ */
/* 단가                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 품목의 단가를 원하는 단위로 환산한다. 원 / `unit` 하나당.
 *
 * 예) 원두 1kg 28,000원 → unitPrice(item, "g") = 28
 * 계열이 다르면 null. 부르는 쪽에서 "단위가 안 맞습니다"를 띄운다.
 */
export function unitPrice(item: VendorItem, unit: string): number | null {
  if (!(item.packAmount > 0) || !Number.isFinite(item.packPrice)) return null;
  // 한 팩이 unit 기준으로 몇 개인지
  const packInUnit = convert(item.packAmount, item.packUnit, unit);
  if (packInUnit === null || packInUnit === 0) return null;
  return item.packPrice / packInUnit;
}

/** 이름으로 품목을 찾는다. 앞뒤 공백만 무시한다 */
export function findItemByName(
  items: VendorItem[],
  name: string,
): VendorItem | null {
  const key = name.trim();
  return items.find((i) => i.name.trim() === key) ?? null;
}

export function vendorOf(
  vendors: Vendor[],
  vendorId: string,
): Vendor | null {
  return vendors.find((v) => v.id === vendorId) ?? null;
}

/* ------------------------------------------------------------------ */
/* 발주 타이밍                                                          */
/* ------------------------------------------------------------------ */

/**
 * 오늘 이 거래처에 주문하면 언제 오는가.
 *
 * 두 가지를 같이 본다.
 *   1) 마감 시각을 넘겼으면 오늘 주문은 내일 주문으로 친다
 *   2) 배송 안 하는 요일은 건너뛴다
 *
 * `docs/day-flow.md`의 "금요일에 주말치까지 주문한다"가 여기서 나온다.
 */
export function arrivalOf(vendor: Vendor, now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1) 마감을 넘겼으면 주문일이 하루 밀린다
  const [ch, cm] = (vendor.cutoff || "23:59").split(":").map(Number);
  const past =
    Number.isFinite(ch) &&
    now.getHours() * 60 + now.getMinutes() >= (ch || 0) * 60 + (cm || 0);
  if (past) d.setDate(d.getDate() + 1);

  // 2) 리드타임
  d.setDate(d.getDate() + Math.max(0, vendor.leadDays));

  // 3) 배송 요일까지 민다. 요일을 하나도 안 고르면 매일 온다고 본다
  const days = vendor.deliverDays.length ? vendor.deliverDays : [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 7 && !days.includes(d.getDay()); i++) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** 마감까지 남은 분. 이미 지났으면 음수 */
export function minutesToCutoff(vendor: Vendor, now: Date): number {
  const [h, m] = (vendor.cutoff || "23:59").split(":").map(Number);
  if (!Number.isFinite(h)) return 0;
  return (h || 0) * 60 + (m || 0) - (now.getHours() * 60 + now.getMinutes());
}

/**
 * 오늘 주문 마감 목록의 순서 — **지금 누를 수 있는 것이 먼저다.**
 *
 * ★ 2026-09-12 고침. 예전에는 `minutesToCutoff` 오름차순으로 그냥 정렬했다.
 *   마감을 지나면 그 값이 **음수**라서 **이미 늦은 거래처가 목록 맨 위**에 서고,
 *   30분 남은 거래처가 그 아래로 밀렸다.
 *
 *   아침에 이 화면을 여는 이유는 «지금 주문하면 되는 것»을 보려는 것이다.
 *   마감이 지난 거래처는 오늘 할 수 있는 일이 없는데 가장 눈에 띄는 자리를
 *   차지하고 있었다 — 정렬이 화면의 목적과 반대였다.
 *
 * 규칙 —
 *   1. 아직 안 지난 것이 먼저. 그중에서는 **남은 시간이 적은 것**부터
 *   2. 지난 것은 뒤로. 그중에서는 **방금 지난 것**부터
 *      (아침에 막 놓친 것은 전화로 넣어볼 여지가 있고, 어제치는 아니다)
 */
export function cutoffOrder(a: Vendor, b: Vendor, now: Date): number {
  const la = minutesToCutoff(a, now);
  const lb = minutesToCutoff(b, now);
  const pastA = la < 0;
  const pastB = lb < 0;
  if (pastA !== pastB) return pastA ? 1 : -1;
  return pastA ? lb - la : la - lb;
}
