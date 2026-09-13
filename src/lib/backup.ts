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
import { loadSales, saveSales, type SalesData } from "./sales.ts";
import { loadVendors, saveVendors, type VendorData } from "./vendors.ts";
import { loadSettings, saveSettings, type Settings } from "./settings.ts";
import { loadLocalRecipes, saveLocalRecipes } from "./localRecipes.ts";
import {
  loadOrderLinks,
  loadOrderLog,
  saveOrderLinks,
  saveOrderLog,
  type OrderLinks,
  type OrderLog,
} from "./orders.ts";
import { loadShiftEdits, saveShiftEdits, type ShiftEdits } from "./shiftEdit.ts";
import type { Recipe } from "./types.ts";
import {
  loadCycleDone,
  loadCycleEvery,
  saveCycleDone,
  saveCycleEvery,
  statusLine,
  type CycleDone,
  type CycleEvery,
} from "./cycleDone.ts";

/**
 * 백업 파일 형식 번호. 나중에 모양이 바뀌면 올리고, 되돌리기에서 분기한다.
 *
 * v2 (2026-09-10) — 주기 점검 기록을 넣었다. **v1 파일도 그대로 되돌릴 수 있다**
 * (아래 `checkRestore`·`applyRestore` 의 주기 부분은 있을 때만 본다).
 */
/**
 * 백업 파일 형식 번호. 모양이 바뀌면 올리고, 되돌리기에서 분기한다.
 *
 * v3 (2026-09-10) — **매출·거래처·설정·내 레시피·발주를 넣었다.**
 *   그전까지 백업은 직원·출퇴근·계약·주기 점검 넷뿐이었다. 앱은 그 밖에도
 *   여섯 덩이를 저장하고 있었는데 **백업에서 통째로 빠져 있었다** —
 *   태블릿이 죽으면 거래처 단가와 매출 기록이 그냥 사라지는 상태였다.
 *   그리고 첫 화면 재촉은 **매출 날짜를 세면서** 재촉하고 있었으므로,
 *   사장님이 백업을 눌러도 매출은 안 담긴 채 재촉만 꺼졌다. 그게 제일 나빴다.
 *
 *   ★ 이런 누락이 다시 생기지 않게 `tests/backup.test.ts` 가
 *     **각 lib 의 저장 키와 이 파일이 담는 것을 맞춰본다.**
 *
 * v2 (2026-09-10) — 주기 점검 기록.
 *
 * **v1·v2 파일도 그대로 되돌릴 수 있다** (뒤에 붙은 칸은 전부 선택 사항이다).
 */
export const BACKUP_VERSION = 3;

/**
 * 백업이 담는 localStorage 키.
 *
 * ★ **새 화면을 만들면서 저장 키를 늘리면 여기에도 넣어야 한다.**
 *   안 넣으면 그 화면만 조용히 백업에서 빠지고, 사람은 백업했다고 믿는다.
 *   실제로 그렇게 됐었다 — 운영 기능 7종이 붙으면서 여섯 덩이가 빠져 있었다.
 *
 *   `tests/backup.test.ts` 가 `src/lib` 의 키 전부를 긁어서 이 목록 또는
 *   아래 제외 목록에 있는지 맞춰본다. 어느 쪽에도 없으면 테스트가 걸린다.
 */
export const BACKUP_KEYS = [
  "sop:roster", // 직원 + 근무표(계획)
  "sop:shifts", // ★ 매장이 고친 근무조 이름·시간. 빠지면 되돌렸을 때
  //                 조 이름이 시드로 돌아가고 근무표 배정이 끊어진다
  "sop:punch", // 출퇴근(실제)        ★ 근로기준법 제42조 3년
  "sop:contracts", // 근로계약 조건    ★ 제42조 3년
  "sop:cycleDone", // 주기 점검을 마지막으로 한 날
  "sop:cycleEvery", // 매장이 정한 점검 주기
  "sop:sales", // 매출
  "sop:vendors", // 거래처 + 품목 단가 — 원가가 여기서 나온다
  "sop:settings", // 최저임금·목표원가율·판매가·원가 제외
  "sop:recipes", // 사장님이 직접 넣은 레시피 (영업비밀)
  "sop:orderLog", // 발주 기록
  "sop:orderLinks", // 발주 항목 ↔ 거래처 연결
] as const;

/**
 * 일부러 담지 않는 키. **왜 안 담는지까지 적어둔다** — 이유가 없으면
 * 다음 사람이 "빠뜨린 것" 으로 보고 넣게 된다.
 *
 *  sop:ownerPin  / sop:storePin  — 잠금번호. 백업 파일에 넣지 않는다.
 *                  파일은 메일·USB로 돌아다니고, 열면 그대로 보인다
 *  sop:ownerOpen / sop:storeOpen — sessionStorage. 잠금 해제 상태를 복원할 이유가 없다
 *  sop:sid       — 지표용 임의 식별자. **기기마다 달라야 한다**
 *  sop:lastBackup— 이 기기가 마지막으로 백업한 시각.
 *                  ★ 담으면 안 된다 — 새 태블릿에 복원했을 때 "이미 백업했음" 을
 *                  물려받아서, 정작 그 기기는 한 번도 안 받았는데 재촉이 안 뜬다
 *
 * 날짜별 체크 상태(`sop:<슬러그>:<날짜>`, `sop:run:<슬러그>`)는 lib 이 아니라
 * 화면에서 만들고, 영업일이 바뀌면 어차피 초기화된다. 그래서 목록에 없다.
 *
 * ⚠️ `sop:mark:<범위>:<날짜>` (누가 · 몇 시에 체크했나, 2026-09-12 신설) 도
 *   날짜가 붙어서 이 목록에 못 넣는다. **기기에는 남지만 백업에는 안 담긴다.**
 *   되짚기용이라 당장은 그래도 되지만, 태블릿을 잃으면 같이 사라진다 —
 *   백업 형식을 고칠 때(`BACKUP_VERSION` 을 올릴 때) 같이 담을 것.
 */
export const EXCLUDED_KEYS = [
  "sop:ownerPin",
  "sop:ownerOpen",
  "sop:storePin",
  "sop:storeOpen",
  "sop:sid",
  "sop:lastBackup",
  /* 이 태블릿을 지금 쓰는 사람. **기기마다 다르고 영업일이 지나면 잊는다.**
     백업에 담아 다른 기기에 되돌리면 거기서 엉뚱한 사람 이름으로 체크가 남는다 */
  "sop:whoami",
] as const;

export type BackupFile = {
  kind: "store-note-backup";
  version: number;
  /** 만든 시각 (ISO). 어느 것이 최신인지 사람이 보고 판단한다 */
  exportedAt: string;
  storeName: string;
  roster: RosterData;
  punches: PunchData;
  contracts: Contract[];

  /**
   * ★ 주기 점검 (v2 부터). **v1 파일에는 없다 — 그래서 선택 사항이다.**
   *
   * 왜 넣었나: 보건증·소방시설·위생교육은 **점검했다는 기록 자체가 증빙**이다.
   * 그런데 이 값은 태블릿 브라우저에만 있어서, 기기를 바꾸거나 사이트 데이터를
   * 지우면 "마지막으로 언제 했는지" 가 통째로 사라진다. 그러면 화면이 다시
   * `기록 없음` 으로 돌아가고, 사장님은 그걸 되찾을 방법이 없다.
   *
   * `cycleEvery` 도 같이 넣는다. 주기는 사장님이 관할 기관에 확인해서 넣은
   * 값이라 다시 알아내려면 또 전화를 돌려야 한다.
   */
  cycleDone?: CycleDone;
  cycleEvery?: CycleEvery;

  /**
   * ★ v3 부터. **v1·v2 파일에는 없다 — 그래서 전부 선택 사항이다.**
   *
   * 왜 늦게 넣었나: 운영 기능 7종을 붙이면서 저장 키가 늘었는데 백업 목록을
   * 같이 안 늘렸다. 화면은 멀쩡하고 백업도 "성공" 이라고 말해서 아무도 몰랐다.
   *
   * 잃으면 어떻게 되는가 —
   *   sales    매출 기록. 날짜마다 쌓이고 되메울 방법이 없다
   *   vendors  거래처 단가. **원가가 여기서 나온다.** 다시 알아내려면 전화를 돌려야 한다
   *   settings 최저임금·목표원가율·판매가·원가 제외 재료
   *   recipes  사장님이 직접 넣은 레시피. **영업비밀이고 앱 밖에 사본이 없다**
   *   orderLog 발주 기록. "주문했는데 안 들어온 것" 의 근거다
   */
  sales?: SalesData;
  vendors?: VendorData;
  settings?: Settings;
  recipes?: Recipe[];
  orderLog?: OrderLog;
  orderLinks?: OrderLinks;

  /**
   * ★ v4 부터 — 매장이 고친 근무조 이름·시간 (2026-09-13).
   *
   * 잃으면 조 이름이 시드 값으로 돌아간다. 그런데 **근무표는 배정을 조 이름
   * 문자열로 저장한다** — 「아침조」로 바꿔 쓰던 매장에서 이 칸이 빠지면
   * 되돌린 뒤 지난 배정이 전부 없는 조를 가리키고, 지각 판정과 인건비가
   * 조용히 달라진다. 화면에는 아무 오류도 안 뜬다.
   */
  shifts?: ShiftEdits;
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

const CYCLE_HEADER = ["항목", "묶음", "마지막으로 한 날", "주기(일)", "상태", "항목ID"];

/**
 * 주기 점검 CSV.
 *
 * ★ 제목은 시드에 있고 기록은 저장소에 있다. 그래서 `labels` 를 밖에서 받는다 —
 *   이 파일은 서버 데이터를 못 읽는다(클라이언트에서 돈다).
 *   제목을 못 찾으면 **id 를 그대로 적는다.** 빈칸으로 두면 무엇을 점검한
 *   기록인지 알 수 없어 증빙으로 쓸 수 없다.
 *
 * 보건증·소방시설·위생교육은 **점검했다는 기록 자체가 증빙**이라
 * 엑셀로 뽑아 보관·제출할 수 있어야 한다.
 */
export function cycleRows(
  done: CycleDone,
  every: CycleEvery,
  labels: Record<string, { title: string; group: string }> = {},
  todayDay?: string,
): (string | number | boolean)[][] {
  const ids = [...new Set([...Object.keys(done), ...Object.keys(every)])].sort();
  return [
    CYCLE_HEADER,
    ...ids.map((id) => {
      const meta = labels[id];
      const st = statusLine(done, id, every[id] ?? null, todayDay);
      return [
        meta ? meta.title : id,
        meta ? meta.group : "",
        done[id] ?? "",
        every[id] ?? "",
        st.text,
        id,
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
    cycleDone: loadCycleDone(),
    cycleEvery: loadCycleEvery(),
    sales: loadSales(),
    vendors: loadVendors(),
    settings: loadSettings(),
    recipes: loadLocalRecipes(),
    orderLog: loadOrderLog(),
    orderLinks: loadOrderLinks(),
    shifts: loadShiftEdits(),
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
  cycle: number;
  salesDays: number;
  vendors: number;
  recipes: number;
  orderDays: number;
} {
  let punches = 0;
  for (const byDate of Object.values(b.punches ?? {})) {
    punches += Object.keys(byDate ?? {}).length;
  }
  return {
    staff: (b.roster?.staff ?? []).length,
    punches,
    contracts: (b.contracts ?? []).length,
    // 주기는 "마지막으로 한 날" 이 적힌 항목 수다. 주기만 정하고 아직 한 적이
    // 없는 것은 세지 않는다 — 잃을 것이 없기 때문이다
    cycle: Object.keys(b.cycleDone ?? {}).length,
    salesDays: Object.keys(b.sales ?? {}).length,
    vendors: (b.vendors?.vendors ?? []).length,
    recipes: (b.recipes ?? []).length,
    orderDays: Object.keys(b.orderLog ?? {}).length,
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
  /* 주기 점검은 v2 에 생겼다. **v1 파일에는 없는 게 정상**이므로 없어도 통과시킨다.
     다만 있는데 모양이 틀리면 그건 손상이다 — 조용히 넘기면 되돌린 뒤에
     점검 기록만 사라진 것을 나중에야 알게 된다. */
  const cycleDoneOk =
    f.cycleDone === undefined || (typeof f.cycleDone === "object" && f.cycleDone !== null);
  const cycleEveryOk =
    f.cycleEvery === undefined || (typeof f.cycleEvery === "object" && f.cycleEvery !== null);
  if (!cycleDoneOk || !cycleEveryOk) {
    return { ok: false, reason: "백업 파일의 점검 기록이 손상되었습니다." };
  }

  /* v3 칸도 같은 규칙이다 — **없으면 통과(v1·v2 파일), 있는데 모양이 틀리면 거부.**
     조용히 넘기면 되돌린 뒤에 거래처 단가만 사라진 것을 나중에야 알게 된다. */
  const objOk = (v: unknown) => v === undefined || (typeof v === "object" && v !== null);
  const arrOk = (v: unknown) => v === undefined || Array.isArray(v);
  const vendorsOk =
    f.vendors === undefined ||
    (typeof f.vendors === "object" &&
      f.vendors !== null &&
      Array.isArray(f.vendors.vendors) &&
      Array.isArray(f.vendors.items));
  if (
    !objOk(f.sales) ||
    !objOk(f.settings) ||
    !objOk(f.orderLog) ||
    !objOk(f.orderLinks) ||
    !arrOk(f.recipes) ||
    !vendorsOk
  ) {
    return {
      ok: false,
      reason: "백업 파일의 매출·거래처·설정 부분이 손상되었습니다.",
    };
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

  /* ★ 주기 점검은 **있을 때만** 덮어쓴다.
     v1 백업(주기 칸이 아예 없는 파일)으로 되돌릴 때 여기서 빈 값을 써버리면,
     그 백업이 담은 적도 없는 점검 기록을 지우는 셈이 된다.
     "덮어쓴다, 합치지 않는다" 는 원칙은 **백업이 그 덩이를 담고 있을 때** 적용된다.
     v2 백업이 빈 점검 기록을 담고 있으면 그건 "비어 있음" 을 담은 것이므로 덮어쓴다. */
  if (file.cycleDone !== undefined && !saveCycleDone(file.cycleDone)) {
    failed.push("점검 기록");
  }
  if (file.cycleEvery !== undefined && !saveCycleEvery(file.cycleEvery)) {
    failed.push("점검 주기");
  }

  /* v3 칸. 위와 같은 규칙 — **백업이 그 덩이를 담고 있을 때만 덮어쓴다.**
     v1·v2 파일로 되돌릴 때 여기서 빈 값을 써버리면, 그 백업이 담은 적도 없는
     거래처 단가와 매출을 지우는 셈이 된다. */
  if (file.sales !== undefined && !saveSales(file.sales)) failed.push("매출");
  if (file.vendors !== undefined && !saveVendors(file.vendors)) failed.push("거래처");
  if (file.settings !== undefined && !saveSettings(file.settings)) failed.push("설정");
  if (file.recipes !== undefined && !saveLocalRecipes(file.recipes)) {
    failed.push("내 레시피");
  }
  if (file.orderLog !== undefined && !saveOrderLog(file.orderLog)) failed.push("발주 기록");
  if (file.orderLinks !== undefined && !saveOrderLinks(file.orderLinks)) {
    failed.push("발주 거래처 연결");
  }
  if (file.shifts !== undefined && !saveShiftEdits(file.shifts)) {
    failed.push("근무조");
  }
  return { ok: failed.length === 0, failed };
}

/* ------------------------------------------------------------------ *
 * 얼마나 위험한가 — 첫 화면 재촉의 근거.
 *
 * 백업 화면 안에만 알려주면 아무 의미가 없다. 백업을 안 하는 사람은
 * 그 화면을 열지 않는다. 그래서 첫 화면(`BackupReminder`)에 띄우는데,
 * **조용해야 할 때 조용하지 않으면 사람은 경고 자체를 무시하게 된다.**
 * 그래서 단계를 나눈다 — 전부 빨간 불로 띄우지 않는다.
 * ------------------------------------------------------------------ */

const LAST_KEY = "sop:lastBackup";

/** 노란(경고) 단계로 넘어가는 기준 — 백업 안 된 기록 일수 */
export const WARN_DAYS = 7;
/** 빨간 단계 */
export const DANGER_DAYS = 14;

export type Level = "none" | "info" | "warn" | "danger";

export type BackupStatus = {
  /** 마지막 전체 백업 시각 (ISO). 한 번도 안 받았으면 null */
  lastAt: string | null;
  /** 그 뒤에 생긴 기록이 며칠치인가 */
  unbackedDays: number;
  level: Level;
  /** 화면에 그대로 띄우는 문장 */
  message: string;
};

/** 이 기기가 마지막으로 전체 백업한 시각 */
export function loadLastBackup(): string | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * 전체 백업을 받았다고 기록한다.
 *
 * ★ CSV 를 받은 것은 여기에 쓰지 않는다. CSV 는 앱으로 되돌릴 수 없고,
 *   출퇴근만 받으면 거래처 단가·설정·레시피는 그대로 위험하다.
 *   "엑셀로 하나 받았으니 됐다" 고 재촉이 꺼지면 그게 제일 나쁘다.
 */
export function markBackedUp(now: Date = new Date()): boolean {
  try {
    localStorage.setItem(LAST_KEY, now.toISOString());
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" 로 보이는 것만 날짜로 센다 */
function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * 기록이 있는 날짜를 전부 모은다.
 *
 * 출퇴근과 매출만 본다. 이 둘이 **날짜마다 쌓이는** 것이고, 보존 의무가
 * 걸린 쪽이며, 잃으면 되메울 방법이 없다. 거래처 단가나 설정은 한 번 넣고
 * 두는 것이라 "며칠치" 라는 말이 성립하지 않는다.
 */
export function recordDates(
  punches: Record<string, Record<string, unknown>>,
  sales: Record<string, unknown>,
): string[] {
  const days = new Set<string>();
  for (const byDate of Object.values(punches ?? {})) {
    for (const d of Object.keys(byDate ?? {})) if (isDateKey(d)) days.add(d);
  }
  for (const d of Object.keys(sales ?? {})) if (isDateKey(d)) days.add(d);
  return [...days].sort();
}

/**
 * 지금 얼마나 위험한가.
 *
 * 오늘 날짜는 세지 않는다. 마감을 아직 안 한 날을 "백업 안 된 기록" 으로
 * 세면 매일 아침 재촉이 한 칸씩 늘고, 그건 사실이 아니다.
 */
export function backupStatus(
  dates: string[],
  lastAt: string | null,
  now: Date = new Date(),
): BackupStatus {
  const dayOf = today;
  const t = dayOf(now);
  const since = lastAt ? dayOf(new Date(lastAt)) : null;

  // 마지막 백업일보다 뒤에 생긴 기록만 센다. 백업한 날 자체는 그날 기록까지
  // 담겼다고 본다 (백업은 그날 마감 후에 받는 게 보통이다).
  const pending = dates.filter((d) => d < t && (since === null || d > since));
  const unbackedDays = pending.length;

  if (unbackedDays === 0) {
    return {
      lastAt,
      unbackedDays: 0,
      level: "none",
      message: lastAt
        ? "백업 이후로 새로 쌓인 기록이 없습니다."
        : "아직 백업할 기록이 없습니다.",
    };
  }

  const level: Level =
    unbackedDays >= DANGER_DAYS
      ? "danger"
      : unbackedDays >= WARN_DAYS
        ? "warn"
        : "info";

  const head = lastAt
    ? `마지막 백업 뒤로 ${unbackedDays}일치가 쌓였습니다`
    : `백업을 한 번도 받지 않았습니다 (${unbackedDays}일치)`;

  const tail =
    level === "danger"
      ? " 지금 태블릿이 초기화되면 이만큼이 그대로 사라집니다."
      : level === "warn"
        ? " 받아서 태블릿 밖에 두세요."
        : "";

  return { lastAt, unbackedDays, level, message: head + "." + tail };
}
