/* ------------------------------------------------------------------ *
 * 내보내기 · 되돌리기 (백업/복원).
 *
 * ★ 왜 이게 급한가
 *   출퇴근 기록과 근로계약은 **근로기준법 제42조로 3년 보존 대상**이다.
 *   그런데 지금 이 앱의 저장소는 태블릿 브라우저 하나뿐이다.
 *   태블릿을 잃거나, 초기화하거나, 브라우저 저장공간을 비우면 **전부 사라진다.**
 *   서버가 붙기 전까지는 이 파일이 유일한 보존 수단이다.
 *
 * ⚠ 내보낸 파일에는 개인정보가 들어 있다 — 이름·전화·이메일·시급·근무기록.
 *   그래서 화면이 그 사실을 먼저 말한다. 파일을 카톡으로 돌리면 안 된다.
 *
 * ────────────────────────────────────────────────────────────────
 * 형식이 두 가지인 이유
 *
 *   1) CSV  — **사람이 보관·제출하는 것.** 엑셀로 열린다. 노무 자료로 낸다면 이쪽.
 *   2) JSON — **앱으로 되돌리기 위한 것.** 기기를 바꾸거나 저장소가 날아갔을 때.
 *
 *   CSV로 되돌리기를 만들지 않았다. 엑셀에서 한 칸만 고쳐도 시각이 문자열로
 *   바뀌거나 요일 배열이 깨지는데, 그걸 앱이 조용히 받아들이면
 *   **근태와 인건비가 틀린 채로 계산된다.** 되돌리기는 JSON만 받는다.
 * ------------------------------------------------------------------ */

import { loadPunches, savePunches, type PunchData, type Punch } from "./attendance.ts";
import { loadContracts, saveContracts, type Contract } from "./contracts.ts";
import { loadRoster, saveRoster, type RosterData, type Staff } from "./roster.ts";

/** 백업 파일 형식 번호. 나중에 모양이 바뀌면 올리고, 되돌리기에서 분기한다 */
export const BACKUP_VERSION = 1;

export type BackupFile = {
  kind: "store-note-backup";
  version: number;
  /** 만든 시각 (ISO). 어느 것이 최신인지 사람이 보고 판단한다 */
  exportedAt: string;
  storeName: string;
  roster: RosterData;
  punches: PunchData;
  contracts: Contract[];
};

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * ★ 엑셀에서 수식으로 실행되는 것을 막는다.
 *
 * `=`, `+`, `-`, `@`, 탭, 캐리지리턴으로 시작하는 칸은 엑셀·구글시트가
 * **수식으로 해석한다.** 메모 칸에 누가 `=1+1`을 적어두면 계산식이 되고,
 * 더 나쁜 것도 넣을 수 있다(외부 참조로 파일 내용을 실어 보내는 식).
 * 직원이 메모를 입력하는 칸이 있으므로 실제로 걸릴 수 있는 경로다.
 *
 * 앞에 작은따옴표를 붙이면 엑셀이 "이건 글자"로 본다.
 * → `docs/deliverables/06_보안설계.md`
 */
export function csvSafe(v: string): string {
  if (/^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}

/** 칸 하나를 CSV 규칙대로 감싼다 */
export function csvCell(value: string | number | boolean): string {
  const s =
    typeof value === "boolean" ? (value ? "예" : "아니오") : String(value ?? "");
  const safe = csvSafe(s);
  // 쉼표·따옴표·줄바꿈이 있으면 감싸고, 안쪽 따옴표는 두 번 쓴다
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/**
 * 행들을 CSV 한 덩이로.
 *
 * ★ 맨 앞에 BOM(`﻿`)을 붙인다. 없으면 **엑셀이 UTF-8을 못 알아보고
 *   한글이 전부 깨진다** — 사장님이 파일을 열어보고 "안 된다"고 판단하는
 *   가장 흔한 지점이다. 메모장·구글시트는 BOM이 없어도 되지만 엑셀은 필요하다.
 */
export function toCsv(rows: (string | number | boolean)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/* ------------------------------------------------------------------ */
/* 출퇴근 CSV                                                          */
/* ------------------------------------------------------------------ */

const PUNCH_HEADER = [
  "직원명",
  "섹션",
  "날짜",
  "출근",
  "퇴근",
  "휴게(분)",
  "메모",
  "직원ID",
];

/**
 * 출퇴근 기록을 날짜순으로 편다.
 *
 * 저장 모양이 `punches[직원][날짜]`라 사람이 읽기 어렵다.
 * 노무 자료는 **날짜 → 직원** 순으로 보는 것이 보통이므로 그렇게 정렬한다.
 *
 * 직원 명단에 없는 staffId도 버리지 않는다 — 퇴사자를 명단에서 지웠어도
 * **그 사람의 근무 기록은 3년 남겨야 한다.** 이름 칸에 표시만 남긴다.
 */
export function punchRows(
  punches: PunchData,
  staff: Staff[],
): (string | number | boolean)[][] {
  const nameOf = new Map(staff.map((s) => [s.id, s]));
  const flat: Punch[] = [];
  for (const byDate of Object.values(punches)) {
    for (const p of Object.values(byDate ?? {})) if (p) flat.push(p);
  }
  flat.sort((a, b) =>
    a.date === b.date ? a.staffId.localeCompare(b.staffId) : a.date.localeCompare(b.date),
  );

  return [
    PUNCH_HEADER,
    ...flat.map((p) => {
      const s = nameOf.get(p.staffId);
      return [
        s ? s.name : "(명단에 없음)",
        s ? s.section : "",
        p.date,
        p.inAt,
        p.outAt,
        p.breakMin,
        p.note,
        p.staffId,
      ];
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 근로계약 CSV                                                        */
/* ------------------------------------------------------------------ */

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

const CONTRACT_HEADER = [
  "직원명",
  "섹션",
  "시작일",
  "종료일",
  "시급(원)",
  "주 소정근로",
  "근무요일",
  "시작시각",
  "종료시각",
  "서면교부",
  "4대보험",
  "메모",
  "직원ID",
];

export function contractRows(
  contracts: Contract[],
  staff: Staff[],
): (string | number | boolean)[][] {
  const nameOf = new Map(staff.map((s) => [s.id, s]));
  const sorted = [...contracts].sort((a, b) =>
    a.staffId === b.staffId
      ? a.startDate.localeCompare(b.startDate)
      : a.staffId.localeCompare(b.staffId),
  );

  return [
    CONTRACT_HEADER,
    ...sorted.map((c) => {
      const s = nameOf.get(c.staffId);
      return [
        s ? s.name : "(명단에 없음)",
        s ? s.section : "",
        c.startDate,
        // 빈 칸을 그냥 두면 "안 적었다"로 읽힌다. 법적으로는 다른 뜻이다
        c.endDate || "기간의 정함 없음",
        c.hourlyWage,
        c.weeklyHours,
        (c.workDays ?? [])
          .slice()
          .sort((x, y) => x - y)
          .map((d) => WEEKDAY[d] ?? "?")
          .join(" "),
        c.startTime,
        c.endTime,
        c.handedOver,
        c.insured,
        c.note,
        c.staffId,
      ];
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 모으기                                                              */
/* ------------------------------------------------------------------ */

export function buildBackup(storeName: string): BackupFile {
  return {
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    storeName,
    roster: loadRoster(),
    punches: loadPunches(),
    contracts: loadContracts(),
  };
}

/** 파일명에 넣을 날짜. `2026-09-07` */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 얼마나 들어 있는지 — 화면에 먼저 보여주고 누르게 한다 */
export function backupCounts(b: BackupFile): {
  staff: number;
  punches: number;
  contracts: number;
} {
  let punches = 0;
  for (const byDate of Object.values(b.punches ?? {})) {
    punches += Object.keys(byDate ?? {}).length;
  }
  return {
    staff: (b.roster?.staff ?? []).length,
    punches,
    contracts: (b.contracts ?? []).length,
  };
}

/* ------------------------------------------------------------------ */
/* 되돌리기                                                            */
/* ------------------------------------------------------------------ */

export type RestoreCheck =
  | { ok: true; file: BackupFile; counts: ReturnType<typeof backupCounts> }
  | { ok: false; reason: string };

/**
 * 되돌리기 전에 파일을 살펴본다.
 *
 * ★ 여기서 느슨하게 통과시키면 안 된다. 잘못된 파일을 받아 덮어쓰면
 *   **3년 보존 대상이 사라진다.** 그래서 "고쳐서 쓰기"를 하지 않는다 —
 *   모양이 다르면 거부하고 왜 거부했는지 말한다.
 */
export function checkRestore(text: string): RestoreCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "이 파일은 백업 파일이 아닙니다 (읽을 수 없는 형식)." };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "이 파일은 백업 파일이 아닙니다." };
  }
  const f = parsed as Partial<BackupFile>;
  if (f.kind !== "store-note-backup") {
    return {
      ok: false,
      reason: "매장수첩에서 내보낸 백업 파일이 아닙니다. 내보내기로 만든 .json을 골라주세요.",
    };
  }
  if (typeof f.version !== "number" || f.version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: `더 새로운 형식의 백업입니다(버전 ${String(f.version)}). 이 태블릿의 앱을 먼저 최신으로 올려주세요.`,
    };
  }
  // 세 덩이가 다 있어야 한다. 하나라도 모양이 다르면 부분 복원을 하지 않는다
  const rosterOk =
    typeof f.roster === "object" && f.roster !== null && Array.isArray(f.roster.staff);
  const punchesOk = typeof f.punches === "object" && f.punches !== null;
  const contractsOk = Array.isArray(f.contracts);
  if (!rosterOk || !punchesOk || !contractsOk) {
    return { ok: false, reason: "백업 파일이 손상되었습니다. 안에 있어야 할 항목이 빠졌습니다." };
  }

  const file = f as BackupFile;
  return { ok: true, file, counts: backupCounts(file) };
}

/**
 * 실제로 되돌린다. **덮어쓴다. 합치지 않는다.**
 *
 * 합치기를 만들지 않은 이유: 같은 직원·같은 날짜의 출퇴근이 양쪽에 다르게
 * 있으면 어느 쪽이 맞는지 앱이 알 수 없다. 조용히 한쪽을 고르면 근태가
 * 틀리고, 그건 급여로 이어진다. 그래서 **사람이 결정하게** 두고
 * 화면에서 "지금 것이 사라진다"를 먼저 확인받는다.
 */
export function applyRestore(file: BackupFile): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (!saveRoster(file.roster)) failed.push("직원 명단");
  if (!savePunches(file.punches)) failed.push("출퇴근");
  if (!saveContracts(file.contracts)) failed.push("근로계약");
  return { ok: failed.length === 0, failed };
}
