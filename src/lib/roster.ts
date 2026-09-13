/* ------------------------------------------------------------------ *
 * 직원 근무표(로스터).
 *
 * `CLAUDE.md`가 말하는 "시간표"는 업무 시간표가 아니라 직원 근무 스케줄이다.
 * 그리고 이건 부가 기능이 아니다 — 누가 언제 있는지가 정해져야
 * "지금 이 시간에 어떤 화면을 띄울지"가 정해진다.
 *
 * 저장은 이 기기(localStorage). 서버 DB는 배포 직전 작업이다.
 * ------------------------------------------------------------------ */

import { newUuid } from "./store.ts";

export type Staff = {
  id: string;
  /** 어느 섹션인지 — 제빵 / 바 / 홀 / 주방 */
  section: string;
  name: string;
  /** 근무표를 보낼 주소. 없으면 메일 발송 대상에서 빠진다 */
  email: string;
  phone: string;
};

/** `assign[staffId][날짜(YYYY-MM-DD)] = 조 이름 또는 "" (휴무)` */
export type Assign = Record<string, Record<string, string>>;

export type RosterData = {
  staff: Staff[];
  assign: Assign;
};

const KEY = "sop:roster";

export const OFF = "";
export const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 자주 쓰는 섹션. 버튼으로 넣어주고, 직접 입력도 받는다 */
export const SECTIONS = ["제빵", "바", "홀", "주방"];

export function loadRoster(): RosterData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { staff: [], assign: {} };
    const parsed = JSON.parse(raw) as { staff?: unknown; assign?: Assign };
    const staff = Array.isArray(parsed.staff)
      ? (parsed.staff as Array<Partial<Staff> & { role?: string }>).map((s) => ({
          id: String(s.id ?? ""),
          // 이전 버전은 'role'이었다. 남아 있는 데이터를 버리지 않는다
          section: s.section ?? s.role ?? "",
          name: s.name ?? "",
          email: s.email ?? "",
          phone: s.phone ?? "",
        }))
      : [];
    return { staff, assign: parsed.assign ?? {} };
  } catch {
    return { staff: [], assign: {} };
  }
}

export function saveRoster(data: RosterData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * 직원 id.
 *
 * ★ 2026-09-13 에 `st-a1b2c3` 에서 **uuid** 로 바꿨다.
 *   서버 `staff.id` 가 `uuid` 라서 옛 모양은 거절당한다. 그리고 서버가 새 id 를
 *   발급하게 두면 **출퇴근·근로계약이 어느 직원 것인지 못 잇는다**
 *   (`punches.staff_id` 와 `contracts.staff_id` 가 이 값을 가리킨다).
 *   저장된 직원이 0명일 때만 바꿀 수 있는 것이었고, 그때 바꿨다.
 */
export function newStaffId(): string {
  return newUuid();
}

export function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 기준일이 속한 주의 월요일 */
export function mondayOf(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay(); // 0=일
  const back = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - back);
  return d;
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function label(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

/** 섹션별로 묶는다. 섹션이 비어 있으면 '미지정'으로 모은다 */
export function bySection(staff: Staff[]): Array<[string, Staff[]]> {
  const map = new Map<string, Staff[]>();
  for (const s of staff) {
    const key = s.section.trim() || "미지정";
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()];
}

/** 칸을 맞춰 표처럼 보이게. 한글은 폭이 2배라 그만큼 세어준다 */
function pad(text: string, width: number): string {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2000 ? 2 : 1;
  return text + " ".repeat(Math.max(1, width - w));
}

/**
 * 메일 본문.
 *
 * 두 덩어리다.
 *   1) 전체 직원 명단 — 섹션 / 이름 / 이메일 / 전화번호
 *   2) 이번 주 근무표 — 섹션별로 묶어서
 *
 * HTML 표는 메일 앱마다 깨지므로 글자 그대로 폭을 맞춘다.
 * 폰에서 그대로 읽히는 것이 목적이다.
 */
export type EmailOptions = {
  /**
   * 명단에 이메일·전화번호를 넣을지.
   *
   * 기본은 넣지 않는다. 받는 사람을 숨은참조로 가려놓고 본문에 연락처를
   * 그대로 실으면 가린 의미가 없다 — 직원 A가 받은 메일에 직원 B의
   * 전화번호가 다 보인다. 연락처 공유가 필요한 경우에만 켠다.
   */
  includeContacts?: boolean;
};

export function buildEmailBody(
  storeName: string,
  days: Date[],
  data: RosterData,
  opts: EmailOptions = {},
): string {
  const withContacts = opts.includeContacts === true;
  const out: string[] = [];
  out.push(`${storeName} 근무표`);
  out.push(`${label(days[0])} ~ ${label(days[6])}`);
  out.push("");

  /* ---------- 1. 전체 직원 명단 ---------- */
  out.push("[ 직원 명단 ]");
  if (withContacts) {
    out.push(pad("섹션", 8) + pad("이름", 12) + pad("이메일", 26) + "전화번호");
    out.push("-".repeat(64));
    for (const s of data.staff) {
      out.push(
        pad(s.section || "-", 8) +
          pad(s.name, 12) +
          pad(s.email || "-", 26) +
          (s.phone || "-"),
      );
    }
  } else {
    out.push(pad("섹션", 10) + "이름");
    out.push("-".repeat(28));
    for (const s of data.staff) {
      out.push(pad(s.section || "-", 10) + s.name);
    }
  }
  out.push("");

  /* ---------- 2. 이번 주 근무표 ---------- */
  out.push("[ 이번 주 근무 ]");
  out.push("");
  for (const [section, members] of bySection(data.staff)) {
    out.push(`● ${section}`);
    for (const s of members) {
      const line = days
        .map((d) => {
          const shift = data.assign[s.id]?.[ymd(d)] ?? OFF;
          return `${label(d)} ${shift || "휴무"}`;
        })
        .join("  /  ");
      out.push(`  - ${s.name}`);
      out.push(`    ${line}`);
    }
    out.push("");
  }

  out.push("변경 사항이 있으면 알려주세요.");
  return out.join("\n");
}
