/* ------------------------------------------------------------------ *
 * 직원 근무표(로스터).
 *
 * `CLAUDE.md`가 말하는 "시간표"는 업무 시간표가 아니라 직원 근무 스케줄이다.
 * 그리고 이건 부가 기능이 아니다 — 누가 언제 있는지가 정해져야
 * "지금 이 시간에 어떤 화면을 띄울지"가 정해진다.
 *
 * 저장은 이 기기(localStorage). 서버 DB는 배포 직전 작업이다.
 * ------------------------------------------------------------------ */

export type Staff = {
  id: string;
  name: string;
  /** 근무표를 보낼 주소. 없으면 발송 대상에서 빠진다 */
  email: string;
  /** 제빵 / 바 / 홀 등. 자유 입력 */
  role: string;
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

export function loadRoster(): RosterData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { staff: [], assign: {} };
    const parsed = JSON.parse(raw) as RosterData;
    return {
      staff: Array.isArray(parsed.staff) ? parsed.staff : [],
      assign: parsed.assign ?? {},
    };
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

export function newStaffId(): string {
  return "st-" + Math.random().toString(36).slice(2, 9);
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

/**
 * 메일에 넣을 본문. 표는 메일 클라이언트마다 깨지므로 줄글로 만든다.
 * 폰에서 그대로 읽을 수 있는 형태가 목적이다.
 */
export function buildEmailBody(
  storeName: string,
  days: Date[],
  data: RosterData,
): string {
  const lines: string[] = [];
  lines.push(`${storeName} 근무표`);
  lines.push(`${label(days[0])} ~ ${label(days[6])}`);
  lines.push("");

  for (const s of data.staff) {
    lines.push(`■ ${s.name}${s.role ? ` (${s.role})` : ""}`);
    for (const d of days) {
      const shift = data.assign[s.id]?.[ymd(d)] ?? OFF;
      lines.push(`   ${label(d)}  ${shift || "휴무"}`);
    }
    lines.push("");
  }

  lines.push("변경 사항이 있으면 알려주세요.");
  return lines.join("\n");
}
