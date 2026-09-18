import type { Punch, PunchData } from "./attendance.ts";
import type { Contract } from "./contracts.ts";
import type { Assign, RosterData, Staff } from "./roster.ts";
import type { Shift } from "./types.ts";
import type { DaySales, SalesData } from "./sales.ts";
import type { Vendor, VendorData, VendorItem } from "./vendors.ts";
import { familyOf } from "./units.ts";

/* ------------------------------------------------------------------ *
 * 브라우저 ↔ 서버 — 매장 데이터를 옮기는 층
 *
 * ★ 왜 localStorage 를 안 버리나
 *   화면이 전부 **동기로** 읽는다(`loadPunches()` 가 바로 값을 돌려준다).
 *   그걸 비동기로 바꾸면 화면 30개를 다 고쳐야 하고, 주방 와이파이가
 *   끊기면 앱이 통째로 멈춘다. 그래서 **localStorage 는 그대로 두고**
 *   서버를 «사라지지 않는 사본» 으로 옆에 붙인다.
 *
 *     화면 열 때  → 서버에서 받아 localStorage 에 덮어쓴다 (pull)
 *     저장할 때   → localStorage 에 쓰고 서버에도 보낸다  (push)
 *
 * ★ 로그인 안 했으면 아무 일도 안 한다.
 *   `STORE_PIN` 없으면 열리고 `SUPABASE_URL` 없으면 파일에 쌓는 것과 같은
 *   규율이다 — **9/18 데모데이에서 로그인이 길을 막으면 안 된다.**
 *
 * ★ 실패를 삼키지 않는다.
 *   못 보냈으면 `{ok:false, reason}` 을 그대로 돌려준다. 화면이 그 문장을
 *   띄운다. 조용히 넘어가면 사장님은 저장된 줄 알고, 기기를 바꾼 날
 *   아무것도 없다는 걸 알게 된다 — 그때는 다시 못 모은다.
 * ------------------------------------------------------------------ */

export type SyncResult =
  | { ok: true; rows: number }
  | { ok: false; reason: string };

/**
 * 「서버를 안 쓰는 상태」 — 오류가 아니다.
 *
 * ★ 이걸 오류와 나누지 않으면 **로그인 안 한 사람에게 빨간 경고가 뜬다.**
 *   로그인은 선택이고(`24_DB이관순서.md`), 9/18 데모데이에서 로그인 화면이
 *   길을 막으면 안 된다. 화면은 이 값을 보면 아무 말도 하지 않는다.
 */
export const SKIP = "skip";

/** 서버 쪽 사정으로 «지금은 안 보낸다» 인 응답들. 사람에게 보일 것이 아니다 */
const SKIP_REASONS = new Set(["anon", "off", "not-configured", "no-store", "stale"]);

export function isSkip(r: SyncResult): boolean {
  return !r.ok && r.reason === SKIP;
}

/**
 * 토큰이 낡았을 때 **한 번만** 갱신시키고 다시 온다.
 *
 * ★★ 갱신은 `/api/auth/me` 한 곳에서만 한다 (2026-09-14).
 *   Supabase 갱신 토큰은 한 번 쓰면 폐기되고 같은 것을 두 번 보내면
 *   **세션 전체가 끊긴다.** 갱신하는 곳이 둘이면 화면을 열 때 동시에
 *   갱신을 시도해서 로그인이 풀린다 — 실제로 그렇게 됐다.
 */
async function nudge(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return false;
    const who = (await res.json()) as { state?: string };
    return who.state === "ok";
  } catch {
    return false;
  }
}

async function get(table: string, retry = true): Promise<unknown[] | null> {
  try {
    const res = await fetch(`/api/data/${table}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; rows?: unknown[]; reason?: string }
      | null;
    if (res.ok && body?.ok && Array.isArray(body.rows)) return body.rows;
    if (retry && body?.reason === "stale" && (await nudge())) return get(table, false);
    return null;
  } catch {
    return null;
  }
}

async function put(table: string, rows: unknown[], retry = true): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/data/${table}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; wrote?: number; reason?: string }
      | null;
    if (res.ok && body?.ok) return { ok: true, rows: body.wrote ?? rows.length };
    const why = body?.reason ?? "";
    /* 토큰만 낡았다 — 갱신시키고 한 번 더. 로그아웃이 아니다 */
    if (retry && why === "stale" && (await nudge())) return put(table, rows, false);
    /* 로그인 안 했거나 설정이 없는 것은 «실패» 가 아니다 — 조용히 넘어간다 */
    if (SKIP_REASONS.has(why)) return { ok: false, reason: SKIP };
    return { ok: false, reason: why || `보내지 못했습니다 (${res.status})` };
  } catch {
    return { ok: false, reason: "서버에 연결하지 못했습니다" };
  }
}

/** 지금 로그인해 있고 매장이 연결돼 있는가 */
export async function signedIn(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return false;
    const who = (await res.json()) as { state?: string };
    return who.state === "ok";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 모양 바꾸기 — 앱은 camelCase, 표는 snake_case
 *
 * ⚠️ 여기서 칸 하나를 빠뜨리면 **그 값만 조용히 사라진다.** 화면은 멀쩡히
 *   돌고, 기기를 바꾼 날에야 빈 칸을 보게 된다. 그래서 양쪽을 한 곳에
 *   붙여 두고 `tests/serverSync.test.ts` 가 왕복을 확인한다.
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const bool = (v: unknown): boolean => v === true;

export function staffToRow(s: Staff): Row {
  return {
    id: s.id,
    name: s.name,
    section: s.section || null,
    email: s.email || null,
    phone: s.phone || null,
  };
}

export function rowToStaff(r: Row): Staff {
  return {
    id: str(r.id),
    section: str(r.section),
    name: str(r.name),
    email: str(r.email),
    phone: str(r.phone),
  };
}

export function punchToRow(p: Punch): Row {
  return {
    id: p.id,
    staff_id: p.staffId,
    business_date: p.date,
    in_at: p.inAt || null,
    out_at: p.outAt || null,
    /* ★ 마감조는 자정을 넘는다. 퇴근이 출근보다 «이르면» 넘긴 것이다 —
       이 값을 안 넣으면 서버에서 근로시간이 음수로 나온다 */
    crosses_midnight: !!(p.inAt && p.outAt && p.outAt < p.inAt),
    break_min: p.breakMin,
    note: p.note || null,
  };
}

export function rowToPunch(r: Row): Punch {
  return {
    id: str(r.id),
    staffId: str(r.staff_id),
    date: str(r.business_date),
    inAt: str(r.in_at).slice(0, 5),
    outAt: str(r.out_at).slice(0, 5),
    breakMin: num(r.break_min),
    note: str(r.note),
  };
}

export function contractToRow(c: Contract): Row {
  return {
    id: c.id,
    staff_id: c.staffId,
    start_date: c.startDate,
    end_date: c.endDate || null,
    hourly_wage: c.hourlyWage,
    weekly_hours: c.weeklyHours,
    work_days: c.workDays,
    work_start: c.startTime || null,
    work_end: c.endTime || null,
    /* ★ 이 둘은 법정 점검이 읽는 값이다 (`0006_contract_flags.sql`).
       빠뜨리면 앱이 «교부 안 했습니다» 라고 거짓으로 경고한다 */
    handed_over: c.handedOver,
    insured: c.insured,
    memo: c.note || null,
  };
}

export function rowToContract(r: Row): Contract {
  return {
    id: str(r.id),
    staffId: str(r.staff_id),
    startDate: str(r.start_date),
    endDate: str(r.end_date),
    hourlyWage: num(r.hourly_wage),
    weeklyHours: num(r.weekly_hours),
    workDays: Array.isArray(r.work_days) ? (r.work_days as number[]).map(num) : [],
    startTime: str(r.work_start).slice(0, 5),
    endTime: str(r.work_end).slice(0, 5),
    handedOver: bool(r.handed_over),
    insured: bool(r.insured),
    note: str(r.memo),
  };
}

/** `punches[staffId][날짜]` 를 줄 목록으로 편다 */
export function flattenPunches(data: PunchData): Punch[] {
  const out: Punch[] = [];
  for (const byDate of Object.values(data)) for (const p of Object.values(byDate)) out.push(p);
  return out;
}

/** 줄 목록을 다시 `punches[staffId][날짜]` 로 접는다 */
export function nestPunches(list: Punch[]): PunchData {
  const out: PunchData = {};
  for (const p of list) {
    if (!p.staffId || !p.date) continue;
    (out[p.staffId] ??= {})[p.date] = p;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 실제로 주고받는 함수
 * ------------------------------------------------------------------ */

export async function pullStaff(): Promise<Staff[] | null> {
  const rows = await get("staff");
  return rows ? rows.map((r) => rowToStaff(r as Row)) : null;
}

/** 서버 `staff.id` 가 uuid 라서, 옛 방식(`st-a1b2c3`)으로 만든 직원은 못 올린다 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function oldStyleStaff(list: Staff[]): Staff[] {
  return list.filter((s) => !UUID.test(s.id));
}

export async function pushStaff(list: Staff[]): Promise<SyncResult> {
  /* ★ 여기서 미리 걸러서 **이유를 말한다.**
     그냥 보내면 서버가 「400」 만 돌려주고, 화면에는 «보내지 못했습니다» 로만
     보여서 사장님이 뭘 해야 할지 알 수 없다. id 모양이 옛것이면 고칠 방법은
     하나뿐이다 — 근무표에서 지우고 다시 넣는 것. 그 문장을 그대로 띄운다. */
  const old = oldStyleStaff(list);
  if (old.length > 0) {
    const who = old.map((s) => s.name || "(이름 없음)").join(", ");
    return {
      ok: false,
      reason: `직원 ${who} 은(는) 예전 방식으로 만들어져 서버에 못 올립니다. 근무표에서 지우고 다시 넣어 주세요.`,
    };
  }
  return put("staff", list.map(staffToRow));
}

/**
 * 직원 한 명을 **서버에서도** 지운다 (2026-09-17).
 *
 * ★ 이것이 없던 동안, 명단에서 뺀 직원이 다음에 화면을 열면 되살아났다 —
 *   태블릿만 지우고 서버에 그대로 두면 「서버에 줄이 있으면 서버가 이긴다」
 *   규칙이 도로 가져온다. 사장님이 «계속 삭제하는데도 안 지워진다» 고 한 것이 이것이다.
 *
 * ★ 출퇴근·근로계약이 있는 직원은 **서버가 거절한다** (3년 보관). 그때 오는
 *   `reason` 은 사람이 읽는 문장이라 화면이 그대로 띄우면 된다.
 *
 * ★ 로그인 안 했으면 `SKIP`. 서버를 안 쓰는 매장은 태블릿에서 지우면 끝이다.
 */
export async function deleteStaff(id: string, retry = true): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/data/staff?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; deleted?: number; reason?: string }
      | null;
    if (res.ok && body?.ok) return { ok: true, rows: body.deleted ?? 0 };
    const why = body?.reason ?? "";
    /* 토큰만 낡았다 — 갱신시키고 한 번 더. 두 번은 안 간다 */
    if (retry && why === "stale" && (await nudge())) return deleteStaff(id, false);
    if (SKIP_REASONS.has(why)) return { ok: false, reason: SKIP };
    return { ok: false, reason: why || `지우지 못했습니다 (${res.status})` };
  } catch {
    return { ok: false, reason: "서버에 연결하지 못했습니다" };
  }
}

export async function pullPunches(): Promise<PunchData | null> {
  const rows = await get("punches");
  return rows ? nestPunches(rows.map((r) => rowToPunch(r as Row))) : null;
}

export async function pushPunches(data: PunchData): Promise<SyncResult> {
  return put("punches", flattenPunches(data).map(punchToRow));
}

export async function pullContracts(): Promise<Contract[] | null> {
  const rows = await get("contracts");
  return rows ? rows.map((r) => rowToContract(r as Row)) : null;
}

/**
 * ★ 시작일이 없는 계약은 **아직 보내지 않는다** (2026-09-16 · 실측).
 *
 *   화면의 「+ 정영호」 는 빈 초안을 만든다 — `startDate: ""`. 그걸 그대로
 *   보내면 표의 `start_date date not null` 이 거절한다:
 *     `invalid input syntax for type date: ""`  (PostgREST 400 → 화면에 502)
 *   그래서 사장님이 초안을 만든 그 순간 **「저장에 실패했습니다」** 가 떴다.
 *   아직 아무것도 안 적은 초안에 실패 경고는 소음이다.
 *
 *   시작일이 들어오면 그때 올라간다. 시작일 없는 근로계약은 법적으로도
 *   성립하지 않으므로, 서버에 없어도 잃는 것이 없다.
 */
export function readyContracts(list: Contract[]): Contract[] {
  return list.filter((c) => c.startDate.trim() !== "");
}

export async function pushContracts(list: Contract[]): Promise<SyncResult> {
  const ready = readyContracts(list);
  if (ready.length === 0) return { ok: true, rows: 0 };
  return put("contracts", ready.map(contractToRow));
}

/* ------------------------------------------------------------------ *
 * 순서가 있는 것들
 *
 * ★ `punches.staff_id` 와 `contracts.staff_id` 는 `staff.id` 를 가리키는
 *   **외래키**다. 직원이 서버에 없는 채로 출퇴근을 보내면 줄이 통째로
 *   거부되는데, 화면에는 「보내지 못했습니다」 로만 보여서 원인을 못 찾는다.
 *   그래서 **직원을 먼저 보내고** 그 다음에 보낸다.
 * ------------------------------------------------------------------ */

/** 직원 → 출퇴근 순서로 보낸다 */
export async function pushAttendance(
  staff: Staff[],
  data: PunchData,
): Promise<SyncResult> {
  const s = await pushStaff(staff);
  if (!s.ok && s.reason !== SKIP) return s;
  return pushPunches(data);
}

/** 직원 → 근로계약 순서로 보낸다 */
export async function pushContractSet(
  staff: Staff[],
  list: Contract[],
): Promise<SyncResult> {
  const s = await pushStaff(staff);
  if (!s.ok && s.reason !== SKIP) return s;
  return pushContracts(list);
}

/* ------------------------------------------------------------------ *
 * 매출 (2026-09-14)
 *
 * ★ 다른 것들과 다른 점 하나 — **줄에 id 가 없다.**
 *   화면의 매출 기록은 «날짜 → 하루치» 라서 id 를 들고 다니지 않는다.
 *   그래서 서버에서 같은 줄인지 보는 열쇠가 `id` 가 아니라
 *   `(store_id, business_date)` 다 → `serverData.ts` 의 `CONFLICT_KEY`.
 *
 * ★ 재료비(`material_cost`)를 빠뜨리면 서버의 「남은 돈」이 실제보다
 *   커 보인다. 칸이 없어서 `0007_daily_sales_material.sql` 로 더했다.
 * ------------------------------------------------------------------ */

export function salesToRow(d: DaySales): Row {
  return {
    business_date: d.date,
    total_amount: d.total,
    ticket_count: d.count,
    material_cost: d.material,
    /* 빈 메모는 null — «비웠다» 와 «안 적었다» 를 굳이 나눌 이유가 없다 */
    memo: d.note.trim() === "" ? null : d.note,
  };
}

export function rowToSales(r: Row): DaySales {
  const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  return {
    date: String(r.business_date ?? ""),
    total: n(r.total_amount),
    count: n(r.ticket_count),
    material: n(r.material_cost),
    note: typeof r.memo === "string" ? r.memo : "",
  };
}

export async function pullSales(): Promise<SalesData | null> {
  const rows = await get("daily_sales");
  if (!rows) return null;
  const out: SalesData = {};
  for (const r of rows as Row[]) {
    const d = rowToSales(r);
    if (d.date) out[d.date] = d;
  }
  return out;
}

export async function pushSales(data: SalesData): Promise<SyncResult> {
  return put("daily_sales", Object.values(data).map(salesToRow));
}

/* ------------------------------------------------------------------ *
 * ★★ 빈 서버로 태블릿을 덮지 않는다 (2026-09-15 · 실제로 기록이 지워졌다)
 *
 *   `pullPunches()` 는 서버가 비어 있으면 `{}` 를 돌려준다. `{}` 는
 *   **참이라서** `if (!server) return;` 를 통과한다. 그래서 로그인한 순간
 *   `savePunches({})` 가 돌고 **태블릿에 있던 출퇴근이 통째로 지워졌다.**
 *
 *   증상이 고약하다 — 사장님 눈에는 «로그인했더니 기록이 사라지고 서버도
 *   여전히 비어 있다» 로 보인다. 실제로 2026-09-14 에 찍은 출근·퇴근 6건이
 *   이렇게 날아갔다.
 *
 *   그래서 두 가지를 같이 고친다.
 *     1. 서버가 비어 있으면 **덮지 않는다**
 *     2. 서버가 비어 있으면 **태블릿 것을 올린다** — 첫 로그인에 올라가야
 *        폴더가 채워지기 시작한다. 안 그러면 로그인한 뒤에 버튼을 한 번 더
 *        눌러야만 올라가고, 그 전까지 서버는 영영 빈 깡통이다
 * ------------------------------------------------------------------ */

/** 서버에서 받은 것에 **줄이 있는가**. 빈 것으로 덮어쓰면 안 된다 */
export function hasRows(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

/* ------------------------------------------------------------------ *
 * ★ 되돌리기는 서버도 덮어쓴다 (2026-09-16)
 *
 *   되돌리기(`applyRestore`)는 태블릿을 «합치지 않고 덮어쓴다». 그런데 서버를
 *   그대로 두면 다음 화면을 열 때 위의 「서버에 줄이 있으면 서버가 이긴다」 규칙이
 *   **방금 되돌린 것을 도로 지운다.** 시연 데이터를 넣고 근무표를 열면 옛 직원
 *   넷이 되살아나는 것이 그 증상이었다 — 그러니 되돌리기는 서버까지 가야 한다.
 *
 *   순서:  비우기(출퇴근 → 계약 → 직원 → 매출)  →  올리기(직원 → 출퇴근 → 계약 → 매출)
 *   ★ 비우는 순서가 거꾸로면 FK 에 걸린다 — 출퇴근·계약이 직원을 가리킨다.
 *     올리는 순서도 같은 이유로 직원이 먼저다.
 *
 *   중간에 실패하면 서버가 반쯤 비어 있을 수 있다. 그때는 숨기지 않고
 *   «어느 단계에서 왜» 를 돌려주고, 화면이 처음부터 다시 하라고 말한다.
 *   태블릿 쪽은 이미 들어가 있으니 다시 누르면 처음부터 다시 간다.
 * ------------------------------------------------------------------ */

/* ★ 가리키는 쪽(자식)이 먼저다. 거꾸로면 외래키가 거부한다.
   거래처는 세 겹이다 — 단가가 품목을, 품목이 거래처를 가리킨다. */
export const REPLACE_DELETE_ORDER = [
  "shift_assignments",
  "punches",
  "contracts",
  "staff",
  "shifts",
  "daily_sales",
  "item_versions",
  "items",
  "suppliers",
] as const;

const TABLE_LABEL: Record<(typeof REPLACE_DELETE_ORDER)[number], string> = {
  punches: "출퇴근",
  contracts: "근로계약",
  staff: "직원",
  daily_sales: "매출",
  item_versions: "단가",
  items: "품목",
  suppliers: "거래처",
  shift_assignments: "근무 배정",
  shifts: "근무조",
};

/** 표 하나를 통째로 비운다 — `replaceAll` 만 부른다 */
async function del(table: string, retry = true): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/data/${table}`, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; deleted?: number; reason?: string }
      | null;
    if (res.ok && body?.ok) return { ok: true, rows: body.deleted ?? 0 };
    const why = body?.reason ?? "";
    if (retry && why === "stale" && (await nudge())) return del(table, false);
    if (SKIP_REASONS.has(why)) return { ok: false, reason: SKIP };
    return { ok: false, reason: why || `비우지 못했습니다 (${res.status})` };
  } catch {
    return { ok: false, reason: "서버에 연결하지 못했습니다" };
  }
}

export type ReplaceResult =
  /** 로그인 안 함·서버 설정 없음 — 태블릿에만 넣었다. 오류가 아니다 */
  | { state: "skip" }
  | { state: "ok"; staff: number; punches: number; contracts: number; sales: number }
  | { state: "fail"; step: string; reason: string };

/** 백업 파일 중 서버 표로 가는 부분. `BackupFile` 이 그대로 들어간다 */
export type ReplaceInput = {
  roster: { staff: Staff[] };
  punches: PunchData;
  contracts: Contract[];
  sales?: SalesData;
  /* ★ 거래처가 빠지면 되돌린 뒤 **서버의 옛 거래처가 되살아난다** —
     위에서 비웠는데 다시 안 올리기 때문이다. 그러면 단가가 어긋나고
     원가율이 조용히 딴 값이 된다. */
  vendors?: VendorData;
};

export async function replaceAll(file: ReplaceInput): Promise<ReplaceResult> {
  if (!(await signedIn())) return { state: "skip" };

  for (const t of REPLACE_DELETE_ORDER) {
    const r = await del(t);
    if (!r.ok) {
      if (isSkip(r)) return { state: "skip" };
      return { state: "fail", step: `${TABLE_LABEL[t]} 비우기`, reason: r.reason };
    }
  }

  const steps: Array<[string, () => Promise<SyncResult>]> = [
    ["직원 올리기", () => pushStaff(file.roster.staff)],
    ["출퇴근 올리기", () => pushPunches(file.punches)],
    ["근로계약 올리기", () => pushContracts(file.contracts)],
    ["매출 올리기", () => pushSales(file.sales ?? {})],
    ["거래처 올리기", () => pushVendors(file.vendors ?? { vendors: [], items: [] })],
  ];
  const n: number[] = [];
  for (const [step, run] of steps) {
    const r = await run();
    if (!r.ok) {
      if (isSkip(r)) return { state: "skip" };
      return { state: "fail", step, reason: r.reason };
    }
    n.push(r.rows);
  }
  return { state: "ok", staff: n[0], punches: n[1], contracts: n[2], sales: n[3] };
}

/* ------------------------------------------------------------------ *
 * 거래처 · 단가 (2026-09-16)
 *
 * ★ 앱의 품목 하나가 서버에서는 **표 둘**로 갈라진다.
 *
 *     items         … 무엇인가 (이름 · 어느 거래처 · 어떤 단위 계열)
 *     item_versions … 얼마인가 (그 값이 유효한 기간까지)
 *
 *   서버는 단가의 **역사**를 담을 수 있게 설계돼 있는데(`validity` 기간과
 *   «겹치면 안 된다» 는 제약), **앱에는 역사가 없다.** 화면은 «지금 단가»
 *   하나만 들고 있다. 그래서 품목마다 **기간이 열린 줄 하나**만 두고 고쳐
 *   쓴다. 줄을 새로 쌓으면 기간이 겹쳐서 제약에 걸리고, 그 실패는
 *   「보내지 못했습니다」 로만 보인다.
 *
 *   ⚠️ 그래서 **단가를 바꾸면 옛 단가는 남지 않는다.** 앱이 원래 그렇다 —
 *   서버로 옮긴다고 없던 역사가 생기지는 않는다. 역사가 필요해지면
 *   그때 줄을 쌓는 쪽으로 바꾸면 되고, 표는 이미 그걸 받을 수 있다.
 *
 * ★ `item_versions.id` 를 품목 id 와 **같게** 둔다.
 *   앱에는 버전이라는 것이 없어서 따로 줄 id 가 없다. 같게 두면 고칠 때
 *   같은 줄을 정확히 찾는다 — 새로 만들면 기간이 겹쳐 거절당한다.
 * ------------------------------------------------------------------ */

/** 기간의 시작. 아주 옛날로 두면 «늘 유효» 가 되고 겹칠 일이 없다 */
const ALWAYS = "[2000-01-01,)";

export function vendorToRow(v: Vendor): Row {
  return {
    id: v.id,
    name: v.name,
    phone: v.phone || null,
    contact: v.contact || null,
    order_method: v.how || null,
    cutoff_time: v.cutoff || null,
    delivery_days: v.deliverDays,
    lead_days: v.leadDays,
    memo: v.note || null,
  };
}

export function rowToVendor(r: Row): Vendor {
  return {
    id: str(r.id),
    name: str(r.name),
    phone: str(r.phone),
    contact: str(r.contact),
    how: str(r.order_method),
    cutoff: str(r.cutoff_time).slice(0, 5),
    deliverDays: Array.isArray(r.delivery_days) ? (r.delivery_days as number[]).map(num) : [],
    leadDays: num(r.lead_days),
    note: str(r.memo),
  };
}

/** 품목의 «무엇인가» 쪽 */
export function itemToRow(i: VendorItem): Row {
  return {
    id: i.id,
    supplier_id: i.vendorId || null,
    name: i.name,
    /* 거래처에서 **사는** 것이다. 우리가 만드는 것(`made`)은 레시피 쪽이다 */
    kind: "purchased",
    base_unit: i.packUnit,
    base_family: familyOf(i.packUnit),
  };
}

/** 품목의 «얼마인가» 쪽 */
export function itemVersionToRow(i: VendorItem): Row {
  return {
    /* ★ 품목 id 와 같게 둔다 — 위 주석 참고 */
    id: i.id,
    item_id: i.id,
    unit_cost: i.packPrice,
    per_unit: i.packAmount,
    pack_unit: i.packUnit,
    /* ★ `items.base_family` 와 같아야 한다 (외래키). 다르면 통째로 거절된다 */
    pack_family: familyOf(i.packUnit),
    validity: ALWAYS,
    note: i.note || null,
  };
}

/** 두 표에서 받은 것을 앱의 품목 하나로 합친다 */
export function rowsToItem(item: Row, version: Row | undefined): VendorItem {
  return {
    id: str(item.id),
    vendorId: str(item.supplier_id),
    name: str(item.name),
    packAmount: num(version?.per_unit),
    packUnit: str(version?.pack_unit) || str(item.base_unit),
    packPrice: num(version?.unit_cost),
    note: str(version?.note),
  };
}

/**
 * 서버가 모르는 단위는 미리 걸러서 **이유를 말한다.**
 *
 * ★ `units` 표에 없는 단위는 외래키에 걸려 거절당하는데, 화면에는
 *   「보내지 못했습니다」 로만 보인다. 앱은 `장`·`팩`·`봉` 도 받지만
 *   서버가 아는 것은 `g·kg·ml·L·개·ea` 뿐이다.
 */
export const SERVER_UNITS = ["g", "kg", "ml", "L", "개", "ea"];

export function unknownUnitItems(items: VendorItem[]): VendorItem[] {
  return items.filter((i) => !SERVER_UNITS.includes(i.packUnit));
}

export async function pullVendors(): Promise<VendorData | null> {
  const [vRows, iRows, verRows] = await Promise.all([
    get("suppliers"),
    get("items"),
    get("item_versions"),
  ]);
  if (!vRows || !iRows || !verRows) return null;

  const byItem = new Map<string, Row>();
  for (const r of verRows as Row[]) byItem.set(str(r.item_id), r);

  return {
    vendors: (vRows as Row[]).map(rowToVendor),
    items: (iRows as Row[]).map((r) => rowsToItem(r, byItem.get(str(r.id)))),
  };
}

/**
 * 거래처 → 품목 → 단가 **순서로** 보낸다.
 *
 * ★ `items.supplier_id` 가 `suppliers.id` 를, `item_versions.item_id` 가
 *   `items.id` 를 가리킨다. 순서를 어기면 외래키가 거부하고, 그 실패는
 *   「보내지 못했습니다」 로만 보여서 원인을 못 찾는다.
 */
export async function pushVendors(data: VendorData): Promise<SyncResult> {
  const bad = unknownUnitItems(data.items);
  if (bad.length > 0) {
    const what = bad.map((i) => `${i.name}(${i.packUnit})`).join(", ");
    return {
      ok: false,
      reason: `${what} 의 단위를 서버가 모릅니다. ${SERVER_UNITS.join(" · ")} 중에서 골라 주세요.`,
    };
  }

  const v = await put("suppliers", data.vendors.map(vendorToRow));
  if (!v.ok) return v;

  const i = await put("items", data.items.map(itemToRow));
  if (!i.ok) return i;

  return put("item_versions", data.items.map(itemVersionToRow));
}

/* ------------------------------------------------------------------ *
 * 근무표 (2026-09-16)
 *
 * ★ 조(shift)의 id 는 시드 값이라 uuid 가 아니다 (`sh-open` …).
 *   그런데 서버 `shifts.id` 는 uuid 다. 직원 때처럼 시드를 통째로 바꾸면
 *   `shiftEdit` · 단일 파일 시연본 · 숫자 정본까지 줄줄이 따라와야 한다.
 *
 *   **조는 매장이 새로 만들 수 없다** — 이름과 시간만 고친다(`shiftEdit.ts`).
 *   즉 **개수와 종류가 시드에 고정**돼 있다. 그래서 시드 id 마다 **붙박이
 *   uuid** 를 하나씩 둔다. 바뀌지 않는 값이므로 매번 같은 줄을 찾는다.
 *
 *   ⚠️ 시드에 조를 더하면 여기도 같이 더해야 한다. 안 그러면 그 조의
 *     배정만 통째로 안 올라간다 — `tests/serverSync.test.ts` 가 잡는다.
 *
 * ★ 배정은 «누가 언제 어느 조» 이고 앱은 그것을 **조 이름**으로 들고 있다
 *   (`assign[staffId][날짜] = "오픈조"`). 서버는 `shift_id` 를 쓰므로
 *   이름 → id 로 바꿔서 보낸다. 휴무("")는 `shift_id: null` 이다.
 * ------------------------------------------------------------------ */

export const SHIFT_UUID: Record<string, string> = {
  "sh-bakery": "5b1f7000-0000-4000-8000-000000000001",
  "sh-open": "5b1f7000-0000-4000-8000-000000000002",
  "sh-close": "5b1f7000-0000-4000-8000-000000000003",
};

export function shiftToRow(s: Shift, order: number): Row | null {
  const id = SHIFT_UUID[s.id];
  if (!id) return null; // 모르는 조 — 위 주석 참고
  return {
    id,
    name: s.name,
    start_at: s.start,
    end_at: s.end,
    note: s.note || null,
    sort_order: order,
  };
}

/** 시드에 있는데 붙박이 uuid 가 없는 조 — 있으면 그 조의 배정이 안 올라간다 */
export function unmappedShifts(shifts: Shift[]): Shift[] {
  return shifts.filter((s) => !SHIFT_UUID[s.id]);
}

export function assignToRows(assign: Assign, shifts: Shift[]): Row[] {
  /* 화면이 들고 있는 것은 **조 이름**이다. 이름이 바뀌어도(매장이 고친다)
     같은 조를 가리키도록 지금 목록에서 이름 → id 를 만든다 */
  const byName = new Map<string, string>();
  for (const s of shifts) {
    const id = SHIFT_UUID[s.id];
    if (id) byName.set(s.name, id);
  }

  const out: Row[] = [];
  for (const [staffId, byDate] of Object.entries(assign)) {
    for (const [date, shiftName] of Object.entries(byDate)) {
      out.push({
        staff_id: staffId,
        business_date: date,
        /* 휴무는 «배정이 없다» 가 아니라 «쉰다고 정했다» 이다.
           줄을 빼면 «아직 안 짰다» 와 구별이 안 된다 */
        shift_id: shiftName ? (byName.get(shiftName) ?? null) : null,
        memo: shiftName || null,
      });
    }
  }
  return out;
}

export function rowsToAssign(rows: Row[]): Assign {
  const out: Assign = {};
  for (const r of rows) {
    const staffId = str(r.staff_id);
    const date = str(r.business_date);
    if (!staffId || !date) continue;
    (out[staffId] ??= {})[date] = str(r.memo);
  }
  return out;
}

export async function pullRoster(): Promise<RosterData | null> {
  const [sRows, aRows] = await Promise.all([get("staff"), get("shift_assignments")]);
  if (!sRows || !aRows) return null;
  return {
    staff: (sRows as Row[]).map(rowToStaff),
    assign: rowsToAssign(aRows as Row[]),
  };
}

/**
 * 직원 → 조 → 배정 **순서로** 보낸다.
 *
 * ★ `shift_assignments` 가 직원과 조를 **둘 다** 가리킨다. 하나라도 서버에
 *   없으면 배정이 통째로 거부되고, 화면에는 「보내지 못했습니다」 로만 보인다.
 */
export async function pushRoster(
  data: RosterData,
  shifts: Shift[],
): Promise<SyncResult> {
  const missing = unmappedShifts(shifts);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `조 ${missing.map((s) => s.name).join(", ")} 을(를) 서버가 모릅니다. 개발자에게 알려 주세요.`,
    };
  }

  const st = await pushStaff(data.staff);
  if (!st.ok) return st;

  const rows = shifts.map((s, i) => shiftToRow(s, i)).filter((r): r is Row => r !== null);
  const sh = await put("shifts", rows);
  if (!sh.ok) return sh;

  return put("shift_assignments", assignToRows(data.assign, shifts));
}
