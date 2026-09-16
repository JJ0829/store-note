import type { Punch, PunchData } from "./attendance.ts";
import type { Contract } from "./contracts.ts";
import type { Staff } from "./roster.ts";
import type { DaySales, SalesData } from "./sales.ts";

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
