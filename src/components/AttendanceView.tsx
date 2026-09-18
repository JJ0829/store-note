"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BTN, BTN_PRIMARY, Card, Caveat, Chip, Empty, INPUT, NumField, Row, Screen, useSaveState } from "@/components/ui";
import { won } from "@/lib/store";
import { logEvent } from "@/lib/metrics";
import { label, loadRoster, mondayOf, saveRoster, weekDays, ymd, type RosterData, type Staff } from "@/lib/roster";
import {
  estimatePay,
  getPunch,
  hhmm,
  hoursLabel,
  judgeDay,
  loadPunches,
  newPunch,
  putPunch,
  savePunches,
  type DayResult,
  type PunchData,
} from "@/lib/attendance";
import { contractOf, loadContracts, saveContracts, type Contract } from "@/lib/contracts";
import WorkSwitch from "@/components/WorkSwitch";
import { SKIP, hasRows, pullPunches, pushAttendance, takeContracts, takeRoster } from "@/lib/serverSync";
import { InlineUnlock, useOwnerOpen } from "@/components/OwnerGate";
import { loadSettings, type Settings } from "@/lib/settings";
import { applyShiftEdits, loadShiftEdits } from "@/lib/shiftEdit";
import type { Shift } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 출퇴근 기록과 근태.
 *
 * 근무표가 이미 "누가 언제 나오는지"를 갖고 있다. 그게 계획이고,
 * 여기가 실제다. 둘을 나란히 두면 근태는 따로 계산할 게 없다.
 *
 * 화면을 둘로 나눈 이유:
 *   [오늘]   직원이 직접 누른다. 버튼 두 개여야 한다. 그 이상이면 안 찍는다
 *   [이번 주] 사장님이 본다. 시간·지각·인건비가 여기 모인다
 *
 * ⚠ 인건비는 추정이다. 4대보험·소득세·수습감액·연차수당이 없다.
 *   급여 대장으로 쓰면 안 된다 — 화면에도 그대로 적어둔다.
 * ------------------------------------------------------------------ */

type Tab = "today" | "week";

/* ------------------------------------------------------------------ *
 * 출근·퇴근 아이콘
 *
 * ★ 주방에서 젖은 손으로 흘깃 보고 누르는 버튼이다. 글자만 있으면
 *   「출근 07:28」·「퇴근 15:40」 이 비슷하게 보인다 — 화살표 방향이
 *   다르면 글자를 안 읽어도 구분된다.
 *
 * ★ 파일을 안 불러온다. `<svg>` 를 그대로 쓴다 — 아이콘 하나 때문에
 *   런타임 의존성을 늘리지 않는다 (지금 3개다).
 * ------------------------------------------------------------------ */

const ICON = "h-[18px] w-[18px] shrink-0";

/** 안으로 들어가는 화살표 */
function ArrowIn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={ICON}
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

/** 밖으로 나가는 화살표 */
function ArrowOut() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={ICON}
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function AttendanceView({
  storeName,
  shifts: seedShifts,
}: {
  storeName: string;
  shifts: Shift[];
}) {
  /* ★ 매장이 고친 조 이름·시간이 있으면 그게 이긴다. 여기서 조 시각은
     **지각 판정**에 쓰이므로 옛 시간을 쓰면 지각이 아닌데 지각으로 뜬다 */
  const [shifts, setShifts] = useState<Shift[]>(seedShifts);
  const [tab, setTab] = useState<Tab>("today");
  const [now, setNow] = useState<Date | null>(null);
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [punches, setPunches] = useState<PunchData>({});
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [monday, setMonday] = useState<Date | null>(null);
  const save = useSaveState();
  /* 출퇴근은 직원이 찍는 화면이라 **버튼은** 잠글 수 없다. 돈을 가리고,
     2026-09-17 부터 **이미 찍힌 시각을 고치는 것**도 가린다 (아래 `timeLocked`). */
  const owner = useOwnerOpen();

  /* ★ 이미 찍힌 시각을 고치는 것은 사장님만 (2026-09-17 · 사장님 결정)
   *
   *   [출근]·[퇴근] 버튼은 그대로 열어 둔다 — 직원이 직접 찍어야 하는 화면이다.
   *   그런데 **찍힌 뒤의 시각 칸은 아무나 고칠 수 있었다.** 직원이 자기 퇴근
   *   시각을 늘려 적으면 그대로 인건비가 된다 (인건비 = 시각 × 시급).
   *   버튼과 달리 이 칸은 **누가 고쳤는지 남지도 않는다.**
   *
   *   `owner.ready` 를 같이 보는 이유: 첫 그림(SSR·수화 전)에는 `open` 이
   *   false 라, 그것만 보면 잠금번호를 안 만든 매장에서도 잠깐 잠겨 보인다.
   *   `useOwnerOpen()` 은 **잠금번호를 아직 안 만들었으면 `open: true`** 다 —
   *   즉 PIN 을 안 쓰는 매장에서는 이 잠금이 아예 안 걸린다.
   */
  const timeLocked = owner.ready && !owner.open;
  /* ★ 서버로 보내는 것은 잠깐 기다렸다 한 번만 (2026-09-16).
     시각 칸(`edit`)은 글자마다 `commit` 이 불린다. 그대로 보내면 요청이 겹쳐
     나가고 **먼저 것이 나중에 도착하면 서버에 옛 값이 남는다** — 계약 화면에서
     실제로 났다(태블릿 10,320 · 서버 0.00). 버튼 한 번이 1.2초 늦게 가는 건 상관없다. */
  const upTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (upTimer.current) clearTimeout(upTimer.current); }, []);

  useEffect(() => {
    const d = new Date();
    setNow(d);
    setMonday(mondayOf(d));
    setRoster(loadRoster());
    setPunches(loadPunches());
    setContracts(loadContracts());
    setSettings(loadSettings());
    setShifts(applyShiftEdits(seedShifts, loadShiftEdits()));

    /* ★ 서버에 사본이 있으면 그것으로 덮어쓴다 (2026-09-13).
       출퇴근은 태블릿 안에만 있으면 기기를 바꾸는 날 통째로 사라진다.
       로그인 안 했으면 `null` 이 와서 아무 일도 안 일어난다 — 지금까지와 같다. */
    /* ★★ 빈 서버로 태블릿을 덮지 않는다 (2026-09-15 · 실제로 지워졌다).
       `{}` 는 참이라 `if (!server)` 를 통과한다 → `savePunches({})` 가 돌고
       어제 찍은 출퇴근이 통째로 사라졌다. 서버도 여전히 비어 있어서
       «로그인했더니 기록만 없어졌다» 로 보였다.
       비어 있으면 반대로 **이 태블릿 것을 올린다** — 첫 로그인에 올라가야
       폴더가 채워지기 시작한다. */
    void pullPunches().then((server) => {
      if (server === null) return; // 로그인 안 함 — 지금까지와 같다
      if (hasRows(server)) {
        savePunches(server);
        setPunches(server);
        return;
      }
      const mine = loadPunches();
      if (hasRows(mine)) sendUp(mine, loadRoster().staff);
    });

    /* ★ 계약·근무표도 받는다 (2026-09-18 · 사장님 지적).
       전에는 출퇴근만 받아서, 기기를 바꾸면 **「근로계약서」 화면을 한 번
       들러야 시급이 생겼다** — 거기서만 서버 계약을 받아 적었기 때문이다.
       시급이 없으면 이 화면의 인건비가 통째로 «—» 가 된다.
       여기서는 **받아 적기만 한다** — 올리는 것은 각자의 주인 화면이 한다. */
    void takeContracts(saveContracts).then((c) => c && setContracts(c));
    void takeRoster(saveRoster).then((r) => r && setRoster(r));

    // ★ 1초마다. 「지금 15:22」 가 30초 늦게 바뀌면 찍은 시각을 의심하게 된다
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [seedShifts]);

  function commit(next: PunchData) {
    setPunches(next);
    // ★ 실패를 알려야 한다. 출퇴근이 안 남으면 급여가 틀린다
    save.report("출퇴근 기록", savePunches(next), () => save.report("출퇴근 기록", savePunches(next)));
    sendUp(next);
  }

  /* ★ 서버에도 보낸다. **태블릿에 저장된 것과 별개로 알린다** —
     둘을 한 줄로 묶으면 «태블릿에는 남았는데 서버에 못 갔다» 를 구분 못 하고,
     그러면 기기를 바꾼 날에야 빈 칸을 보게 된다.
     로그인 안 했으면 `SKIP` 이 와서 아무 말도 안 한다. */
  /* ★ `staffList` 를 받는 이유 — 첫 로그인에 올릴 때는 `roster` 상태가 아직
     안 채워져 있다(같은 effect 안에서 부르므로). 그때는 방금 읽은 것을 넘긴다. */
  function sendUp(next: PunchData, staffList?: Staff[]) {
    const staff = staffList ?? roster?.staff;
    if (!staff) return;
    if (upTimer.current) clearTimeout(upTimer.current);
    upTimer.current = setTimeout(() => {
      void pushAttendance(staff, next).then((r) => {
        if (!r.ok && r.reason === SKIP) return;
        save.report("출퇴근 기록(서버 보관)", r.ok, () => sendUp(next, staff));
      });
    }, 1200);
  }

  const days = useMemo(() => (monday ? weekDays(monday) : []), [monday]);

  if (!now || !roster || !settings || !monday) {
    return (
      <Screen title="출퇴근 · 근태" storeName={storeName} wide>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  if (roster.staff.length === 0) {
    return (
      <Screen title="출퇴근 · 근태" storeName={storeName} wide>
        <div className="mt-5">
          <Empty>
            직원이 아직 없습니다.
            <br />
            근무표에서 직원을 먼저 넣어 주세요. 출퇴근은 근무표에 잡힌 조와
            비교해서 지각·결근을 봅니다.
          </Empty>
          <Link href="/roster" className={`${BTN_PRIMARY} mt-3 block text-center`}>
            근무표로 가기
          </Link>
        </div>
      </Screen>
    );
  }

  const today = ymd(now);

  function stamp(staffId: string, which: "in" | "out") {
    const cur = getPunch(punches, staffId, today) ?? newPunch(staffId, today);
    const t = hhmm(now!);
    commit(
      putPunch(punches, {
        ...cur,
        ...(which === "in" ? { inAt: t } : { outAt: t }),
      }),
    );
    /**
     * ★ 버튼으로 찍은 것만 남긴다.
     *
     * 아래 `edit()`(시각 칸 직접 입력)은 `onChange` 라 글자마다 불려서
     * 이벤트가 폭주한다. 그리고 재고 싶은 것은 **"하루 2번 찍히는가"** 이므로
     * 버튼 쪽이 맞다. 이름·시각은 담지 않는다 — 개인정보이고, 세는 데
     * 필요하지도 않다.
     *
     * ★ 이름이 곧 버튼이다 (2026-09-13). 전에는 `punch` 하나에
     *   `which: "in"|"out"` 을 붙였는데, 화면 버튼은 「출근」「퇴근」이라
     *   표를 열어 본 사람이 매번 코드를 뒤져야 했다. 담는 값이 아예 없으니
     *   **이름·시각이 섞일 자리도 없다.**
     */
    if (which === "in") logEvent("출근");
    else logEvent("퇴근");
  }

  function edit(staffId: string, patch: Partial<ReturnType<typeof newPunch>>) {
    /* ★ 화면에서 이미 `readOnly` 로 막지만 여기서도 막는다.
       한 겹이면 나중에 칸을 하나 더 붙이는 사람이 `readOnly` 를 빼먹는다 —
       그러면 아무 오류 없이 다시 열린다. */
    if (timeLocked) return;
    const cur = getPunch(punches, staffId, today) ?? newPunch(staffId, today);
    commit(putPunch(punches, { ...cur, ...patch }));
  }

  /* ---------------------------------------------------------------- */
  /* 이번 주 집계                                                      */
  /* ---------------------------------------------------------------- */

  const weekly = roster.staff.map((s) => {
    const results: DayResult[] = days.map((d) => {
      const date = ymd(d);
      return judgeDay(
        date,
        roster.assign[s.id]?.[date] ?? "",
        getPunch(punches, s.id, date),
        shifts,
      );
    });
    const contract = contractOf(contracts, s.id);
    const pay = estimatePay(results, {
      hourlyWage: contract?.hourlyWage ?? 0,
      fiveOrMore: settings.fiveOrMore,
      contractWeeklyHours: contract?.weeklyHours ?? null,
    });
    return { staff: s, results, contract, pay };
  });

  const laborTotal = weekly.reduce((sum, w) => sum + w.pay.total, 0);
  const noWage = weekly.filter((w) => !w.contract || w.contract.hourlyWage <= 0);

  return (
    <Screen
      title="출퇴근 · 근태"
      storeName={storeName}
      saved={save.saved}
      saveFailed={save.failures}
      wide
    >
      {/* ★ 근무표와 한 몸이다 — 계획(근무표) − 실제(출퇴근) = 근태.
          홈을 거치지 않고 바로 오간다 */}
      <WorkSwitch current="punch" />

      {/* ---------- 탭 ---------- */}
      <div className="mt-4 flex gap-2">
        <Chip on={tab === "today"} onClick={() => setTab("today")}>
          오늘 ({label(now)})
        </Chip>
        <Chip on={tab === "week"} onClick={() => setTab("week")}>
          이번 주 · 근태
        </Chip>
      </div>

      {/* ---------- 항상 보이는 고지 (사장님 지시 2026-09-13) ----------
          ★ **가림막 밖**에 둔다. 전에는 이 두 문장이 「이번 주 · 근태」의
            인건비 카드 안에 있어서, 잠겨 있으면(=공용 태블릿의 기본 상태)
            아무도 못 봤다. 그런데 이 화면에서 가장 오해하기 쉬운 것이
            **여기 금액이 급여가 아니라는 것**이다. 오해는 잠긴 상태에서도
            생기므로 고지도 잠긴 상태에서 보여야 한다. */}
      <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[12px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p>
          인건비는 <b>추정</b>입니다 — 4대보험·소득세·수습감액·연차수당
          미포함. <b>급여 대장으로 쓰지 마세요.</b>
        </p>
        <p className="mt-1">
          <b>5인 미만</b>은 연장 가산수당이 없습니다 (근로기준법 제11조).
        </p>
      </div>

      {tab === "today" ? (
        /* ============ 오늘 ============ */
        /* ★ 2026-09-18 — 여백을 줄였다 (사장님 지적: *"공백이 너무 심합니다"*).
           직원이 늘수록 카드가 세로로만 쌓여서 태블릿 화면의 절반이 빈칸이었다.
           md(768px+)부터 **두 열**로 세우고, 카드 안 간격도 좁혔다.
           폰은 한 줄 그대로다 — 주방에서 젖은 손으로 누르는 버튼이라
           **버튼 크기 자체는 안 줄였다.** */
        <div className="mt-3 grid gap-2.5 md:grid-cols-2 md:items-start">
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 md:col-span-2">
            지금 {hhmm(now)} · 버튼을 누르면 그 시각으로 찍힙니다. 잘못
            찍었으면 시각을 직접 고칠 수 있습니다.
          </p>

          {[...roster.staff]
            // 오늘 근무표에 잡힌 사람을 위로 올린다
            .sort((a, b) => {
              const pa = roster.assign[a.id]?.[today] ? 0 : 1;
              const pb = roster.assign[b.id]?.[today] ? 0 : 1;
              return pa - pb;
            })
            .map((s) => {
              const planned = roster.assign[s.id]?.[today] ?? "";
              const p = getPunch(punches, s.id, today);
              const r = judgeDay(today, planned, p, shifts);
              const working = r.status === "근무중";

              return (
                <Card key={s.id}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[16px] font-bold">
                        {s.name}
                        <span className="ml-2 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                          {s.section}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                        {planned ? `근무표: ${planned}` : "근무표: 휴무"}
                      </span>
                    </span>
                    <span
                      className={[
                        "shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold",
                        r.status === "지각"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : r.status === "결근"
                            ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            : working
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : r.status === "정상"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                      ].join(" ")}
                    >
                      {r.status}
                    </span>
                  </div>

                  {/* 큰 버튼 두 개. 아이콘을 넣어서 글자 없이도 구분된다 —
                      주방에서 흘깃 보고 누르는 버튼이다 */}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => stamp(s.id, "in")}
                      className={[
                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[15px] font-bold",
                        p?.inAt
                          ? "border-2 border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                          : "bg-orange-500 text-white active:bg-orange-600",
                      ].join(" ")}
                    >
                      <ArrowIn />
                      {p?.inAt ? `출근 ${p.inAt}` : "출근"}
                    </button>
                    <button
                      type="button"
                      onClick={() => stamp(s.id, "out")}
                      disabled={!p?.inAt}
                      className={[
                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[15px] font-bold",
                        !p?.inAt
                          ? "border-2 border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600"
                          : p?.outAt
                            ? "border-2 border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                            : "bg-zinc-900 text-white active:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900",
                      ].join(" ")}
                    >
                      <ArrowOut />
                      {p?.outAt ? `퇴근 ${p.outAt}` : "퇴근"}
                    </button>
                  </div>

                  {p?.inAt && (
                    <div className="mt-2 flex flex-wrap items-end gap-1.5">
                      <label className="flex items-center gap-1.5">
                        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                          출근
                        </span>
                        <input
                          value={p.inAt}
                          onChange={(e) => edit(s.id, { inAt: e.target.value })}
                          readOnly={timeLocked}
                          aria-readonly={timeLocked}
                          placeholder="07:30"
                          aria-label={`${s.name} 출근 시각`}
                          className={`${INPUT} w-20 py-1.5 text-center font-mono ${timeLocked ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" : ""}`}
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                          퇴근
                        </span>
                        <input
                          value={p.outAt}
                          onChange={(e) => edit(s.id, { outAt: e.target.value })}
                          readOnly={timeLocked}
                          aria-readonly={timeLocked}
                          placeholder="15:30"
                          aria-label={`${s.name} 퇴근 시각`}
                          className={`${INPUT} w-20 py-1.5 text-center font-mono ${timeLocked ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" : ""}`}
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                          휴게
                        </span>
                        <div className="w-24">
                          <NumField
                            label={`${s.name} 휴게시간`}
                            value={p.breakMin}
                            onChange={(v) => { if (!timeLocked) edit(s.id, { breakMin: v }); }}
                            suffix="분"
                          />
                        </div>
                      </label>
                    </div>
                  )}

                  {p?.inAt && timeLocked && (
                    <p className="mt-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                      🔒 찍힌 시각을 고치는 것은 사장님만 합니다. [이번 주] 탭에서
                      잠금번호를 넣으면 고칠 수 있습니다.
                    </p>
                  )}

                  {r.lateMin > 0 && (
                    <p className="mt-2 text-[13px] font-semibold text-red-600 dark:text-red-400">
                      근무표({r.planned} {shifts.find((sh) => sh.name === r.planned)?.start})보다{" "}
                      {hoursLabel(r.lateMin)} 늦게 찍혔습니다
                    </p>
                  )}

                  {r.workedMin !== null && (
                    <p className="mt-2 text-[13px] font-semibold">
                      실근로 {hoursLabel(r.workedMin)}
                      {r.overtimeMin > 0 && (
                        <span className="ml-2 text-orange-600 dark:text-orange-400">
                          연장 {hoursLabel(r.overtimeMin)}
                        </span>
                      )}
                    </p>
                  )}

                  {r.breakShort && (
                    <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      휴게시간이 법에서 정한 만큼보다 짧습니다. 근로기준법
                      제54조 — 4시간 근무에 30분, 8시간 근무에 1시간 이상을
                      주어야 합니다.
                    </p>
                  )}
                </Card>
              );
            })}
        </div>
      ) : (
        /* ============ 이번 주 ============ */
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              className={BTN}
              onClick={() => {
                const d = new Date(monday);
                d.setDate(d.getDate() - 7);
                setMonday(d);
              }}
            >
              ‹ 지난주
            </button>
            <span className="text-[14px] font-bold">
              {label(days[0])} ~ {label(days[6])}
            </span>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                const d = new Date(monday);
                d.setDate(d.getDate() + 7);
                setMonday(d);
              }}
            >
              다음주 ›
            </button>
          </div>

          {/* 표 — 좁은 화면에서는 옆으로 스크롤 */}
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">직원</th>
                  {days.map((d) => (
                    <th key={ymd(d)} scope="col" className="px-1.5 py-2.5 text-center font-semibold">
                      {d.getMonth() + 1}/{d.getDate()}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">근로</th>
                  {owner.open && (
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">인건비(추정)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {weekly.map(({ staff, results, pay, contract }) => (
                  <tr key={staff.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <th scope="row" className="px-3 py-2.5 text-left font-normal">
                      <span className="block font-semibold">{staff.name}</span>
                      {owner.open && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {contract && contract.hourlyWage > 0
                            ? `${won(contract.hourlyWage)}원/시`
                            : "시급 없음"}
                        </span>
                      )}
                    </th>
                    {results.map((r) => (
                      <td key={r.date} className="px-1.5 py-2.5 text-center">
                        {r.status === "휴무" ? (
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                        ) : r.status === "결근" ? (
                          <span className="font-bold text-red-500">결</span>
                        ) : r.workedMin === null ? (
                          <span className="text-orange-500">중</span>
                        ) : (
                          <span
                            className={[
                              "font-mono tabular-nums",
                              r.lateMin > 0 ? "text-red-600 dark:text-red-400" : "",
                            ].join(" ")}
                          >
                            {(r.workedMin / 60).toFixed(1)}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {hoursLabel(pay.workedMin)}
                      {pay.overtimeMin > 0 && (
                        <span className="block text-[11px] text-orange-600 dark:text-orange-400">
                          연장 {hoursLabel(pay.overtimeMin)}
                        </span>
                      )}
                    </td>
                    {owner.open && (
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                        {contract && contract.hourlyWage > 0 ? `${won(pay.total)}원` : "—"}
                        {pay.holidayPay > 0 && (
                          <span className="block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                            주휴 {won(pay.holidayPay)}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {owner.ready && !owner.open ? (
            <InlineUnlock
              what="시급과 인건비는 사장님만 봅니다"
              onOpen={() => owner.setOpen(true)}
            />
          ) : (
            <>
            <Card title="이번 주 합계">
              <div className="mt-1">
                <Row
                  label="총 근로시간"
                  value={hoursLabel(weekly.reduce((s, w) => s + w.pay.workedMin, 0))}
                />
                <Row
                  label="연장"
                  value={hoursLabel(weekly.reduce((s, w) => s + w.pay.overtimeMin, 0))}
                />
                <Row label="인건비 (추정)" value={`${won(laborTotal)}원`} strong />
              </div>
            </Card>

            {noWage.length > 0 && (
              <Caveat>
                시급이 없는 직원이 <b>{noWage.length}명</b>({noWage.map((w) => w.staff.name).join(", ")})
                있어서 인건비 합계가 실제보다 적습니다.{" "}
                <Link href="/contracts" className="underline">
                  근로계약서에서 시급 넣기
                </Link>
              </Caveat>
            )}

            <Caveat>
              여기 금액은 <b>추정</b>입니다. 4대보험·소득세·수습 감액·연차수당이
              들어 있지 않고, {settings.fiveOrMore ? "5인 이상" : "5인 미만"}{" "}
              기준으로 연장 가산을{" "}
              {settings.fiveOrMore ? "적용했습니다" : "적용하지 않았습니다"}
              (근로기준법 제11조·제56조). <b>급여 대장으로 쓰지 마세요.</b>{" "}
              <Link href="/contracts" className="underline">
                사업장 규모 설정
              </Link>
            </Caveat>
            </>
          )}

        </div>
      )}
    </Screen>
  );
}
