/* ------------------------------------------------------------------ *
 * 근로계약서 관리.
 *
 * ★ 이 화면은 계약서를 "보관"하지 않는다. **조건과 의무만 추적**한다.
 *
 * 왜 그렇게 했는지가 중요하다. 근로계약서 원본에는 주민등록번호·주소가
 * 들어간다. 그걸 공용 태블릿의 브라우저 저장소에 평문으로 넣으면,
 * 태블릿을 만지는 모든 직원이 동료의 주민번호를 볼 수 있다.
 * 개인정보보호법 제24조의2는 주민등록번호를 법령에 근거가 있을 때만
 * 처리하도록 하고 있고, 그 근거가 있더라도 **암호화 저장**을 요구한다.
 * 지금 구조(localStorage)로는 그 요건을 맞출 수 없다.
 *
 *   ⇒ 그래서 주민등록번호 칸을 아예 만들지 않았다.
 *     원본 계약서는 종이나 잠긴 폴더에 두고, 여기서는
 *     "누구와 · 언제부터 · 시급 얼마 · 서면 교부했는가 · 언제까지 보관"
 *     만 본다. 이게 실제로 과태료가 나오는 지점이다.
 *
 * 법 근거
 *   - 근로기준법 제17조  근로조건 서면 명시·교부 (위반 500만원 이하 벌금)
 *   - 근로기준법 제42조  계약 서류 3년 보존
 *   - 근로기준법 제55조  1주 15시간 이상이면 유급주휴
 *   - 기간제법  제4조   2년 초과 사용 시 기간의 정함이 없는 근로계약 전환
 *   - 최저임금법 제6조   최저임금 미달 지급 금지
 * ------------------------------------------------------------------ */

import { loadJson, newId, saveJson } from "./store.ts";

export type Contract = {
  id: string;
  /** roster.ts의 Staff.id */
  staffId: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** 비어 있으면 기간의 정함이 없는 근로계약 */
  endDate: string;
  /** 시급 (원) */
  hourlyWage: number;
  /** 1주 소정근로시간 */
  weeklyHours: number;
  /** 근무 요일 (0=일 … 6=토) */
  workDays: number[];
  /** 소정 근로시간대 */
  startTime: string;
  endTime: string;
  /** ★ 제17조 — 서면으로 만들어 **교부**까지 했는가 */
  handedOver: boolean;
  /** 4대보험 가입 */
  insured: boolean;
  note: string;
};

const KEY = "sop:contracts";

export function loadContracts(): Contract[] {
  const list = loadJson<Contract[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveContracts(list: Contract[]): boolean {
  return saveJson(KEY, list);
}

export function newContract(staffId: string): Contract {
  return {
    id: newId("ct"),
    staffId,
    startDate: "",
    endDate: "",
    hourlyWage: 0,
    weeklyHours: 0,
    workDays: [],
    startTime: "",
    endTime: "",
    handedOver: false,
    insured: false,
    note: "",
  };
}

export function contractOf(list: Contract[], staffId: string): Contract | null {
  // 한 사람에게 계약이 여러 개면 시작일이 가장 늦은 것이 현재 계약이다
  const mine = list
    .filter((c) => c.staffId === staffId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  return mine[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* 법정 점검                                                            */
/* ------------------------------------------------------------------ */

export type Level = "danger" | "warn" | "info";

export type Check = {
  level: Level;
  title: string;
  /** 무슨 법 몇 조인지. 심사·근로감독 때 그대로 근거가 된다 */
  basis: string;
};

/** 계약 종료 후 3년 (제42조) — 보관 만기일 */
export function keepUntil(c: Contract): Date | null {
  const end = c.endDate || c.startDate;
  if (!end) return null;
  const d = new Date(end + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + 3);
  return d;
}

/**
 * 계약 하나를 훑어서 걸리는 것들을 돌려준다.
 *
 * 숫자를 만들어내지 않는다. 최저임금은 설정에서 받은 값을 쓴다 —
 * 해마다 바뀌는 값을 코드에 박아두면 내년에 조용히 틀린 경고를 준다.
 */
export function checkContract(
  c: Contract,
  minWage: number,
  today = new Date(),
): Check[] {
  const out: Check[] = [];

  if (!c.handedOver) {
    out.push({
      level: "danger",
      title: "서면 교부를 아직 안 했습니다",
      basis: "근로기준법 제17조 · 위반 시 500만원 이하 벌금",
    });
  }

  if (c.hourlyWage > 0 && minWage > 0 && c.hourlyWage < minWage) {
    out.push({
      level: "danger",
      title: `시급이 최저임금(${minWage.toLocaleString("ko-KR")}원)보다 낮습니다`,
      basis: "최저임금법 제6조 · 미달분은 무효이고 차액을 지급해야 합니다",
    });
  }

  if (!c.startDate) {
    out.push({
      level: "warn",
      title: "계약 시작일이 비어 있습니다",
      basis: "근로기준법 제17조 · 근로계약기간은 서면 명시 사항입니다",
    });
  }

  if (c.weeklyHours >= 15) {
    out.push({
      level: "info",
      title: "주휴수당이 발생합니다 (주 15시간 이상)",
      basis: "근로기준법 제55조",
    });
  } else if (c.weeklyHours > 0) {
    out.push({
      level: "info",
      title: "주 15시간 미만이라 주휴수당이 없습니다",
      basis: "근로기준법 제18조 제3항",
    });
  }

  // 기간제 2년 초과 — 지나면 정규직 전환으로 본다
  if (c.startDate && c.endDate) {
    const s = new Date(c.startDate + "T00:00:00");
    const e = new Date(c.endDate + "T00:00:00");
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
      if (months > 24) {
        out.push({
          level: "warn",
          title: "계약 기간이 2년을 넘습니다",
          basis: "기간제법 제4조 · 2년 초과 시 기간의 정함이 없는 근로계약으로 봅니다",
        });
      }
      // 만료 임박
      const left = Math.ceil((e.getTime() - today.getTime()) / 86_400_000);
      if (left >= 0 && left <= 30) {
        out.push({
          level: "warn",
          title: `계약이 ${left}일 뒤 만료됩니다`,
          basis: "갱신하거나 종료 통보가 필요합니다",
        });
      }
    }
  }

  if (!c.insured) {
    out.push({
      level: "info",
      title: "4대보험 가입 표시가 없습니다",
      basis: "월 60시간 이상이면 가입 대상입니다 — 확인해 주세요",
    });
  }

  return out;
}
