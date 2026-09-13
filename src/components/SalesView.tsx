"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BTN, Card, Caveat, Chip, NumField, Row, Screen, useSaveState } from "@/components/ui";
import { pct, won } from "@/lib/store";
import { logEvent } from "@/lib/metrics";
import { label, loadRoster, mondayOf, weekDays, ymd, type RosterData } from "@/lib/roster";
import {
  dayLaborCost,
  getPunch,
  hoursLabel,
  judgeDay,
  loadPunches,
  type PunchData,
} from "@/lib/attendance";
import { contractOf, loadContracts, type Contract } from "@/lib/contracts";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";
import {
  dailyFixed,
  getDay,
  loadSales,
  profitOf,
  saveSales,
  sumRange,
  type SalesData,
} from "@/lib/sales";
import { applyShiftEdits, loadShiftEdits } from "@/lib/shiftEdit";
import type { Shift } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 매출 보고.
 *
 * 매출만 보여주는 화면은 만들 이유가 없다 — 포스기가 이미 안다.
 * 이 화면의 존재 이유는 **빼기** 하나다.
 *
 *      매출 − 재료비 − 인건비 = 순익
 *
 * 인건비는 안 물어본다. 출퇴근 기록과 계약서 시급에서 그냥 나온다.
 * 사장님이 마감할 때 넣는 건 매출·건수·재료비 셋뿐이다.
 * 그 이상 요구하면 셋째 날부터 안 쓴다.
 *
 * ★ 2026-09-12 — **고정비를 넣으면 진짜 순익이 된다.**
 *   설정의 `monthlyFixed` 를 영업일수로 나눠 매일 뺀다.
 *   ⚠ 안 넣었으면 제목에 **「(고정비 전)」** 을 붙인다. 0 을 «고정비 없음» 으로
 *   읽고 그냥 「하루 순익」이라고 부르면
 *   그 숫자로 가격을 정하는 사람이 손해를 본다.
 *   ⚠ 세금·감가상각은 여전히 빠져 있다. 매출에 따라 달라져서 일할로 못 나눈다.
 * ------------------------------------------------------------------ */

export default function SalesView({
  storeName,
  shifts: seedShifts,
}: {
  storeName: string;
  shifts: Shift[];
}) {
  /* ★ 인건비가 조 시각에 딸려 있다. 매장이 고친 값을 써야 한다 */
  const [shifts, setShifts] = useState<Shift[]>(seedShifts);
  const [tab, setTab] = useState<"day" | "week">("day");
  const [today, setToday] = useState<Date | null>(null);
  const [pick, setPick] = useState<string>("");
  const [sales, setSales] = useState<SalesData>({});
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [punches, setPunches] = useState<PunchData>({});
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const save = useSaveState();

  useEffect(() => {
    const d = new Date();
    setToday(d);
    setPick(ymd(d));
    setSales(loadSales());
    setRoster(loadRoster());
    setPunches(loadPunches());
    setContracts(loadContracts());
    setSettings(loadSettings());
    setShifts(applyShiftEdits(seedShifts, loadShiftEdits()));
  }, [seedShifts]);

  /** 그날 인건비 — 출퇴근 × 시급 */
  const laborOn = useMemo(() => {
    return (date: string): { cost: number; minutes: number; noWage: string[] } => {
      if (!roster || !settings) return { cost: 0, minutes: 0, noWage: [] };
      let cost = 0;
      let minutes = 0;
      const noWage: string[] = [];
      for (const s of roster.staff) {
        const r = judgeDay(
          date,
          roster.assign[s.id]?.[date] ?? "",
          getPunch(punches, s.id, date),
          shifts,
        );
        if ((r.workedMin ?? 0) === 0) continue;
        minutes += r.workedMin ?? 0;
        const c = contractOf(contracts, s.id);
        if (!c || c.hourlyWage <= 0) {
          noWage.push(s.name);
          continue;
        }
        cost += dayLaborCost(r, c.hourlyWage, settings.fiveOrMore);
      }
      return { cost, minutes, noWage };
    };
  }, [roster, punches, contracts, settings, shifts]);

  if (!today || !roster || !settings) {
    return (
      <Screen title="매출" storeName={storeName} wide>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  function patch(date: string, p: Partial<ReturnType<typeof getDay>>) {
    const cur = getDay(sales, date);
    const merged = { ...cur, ...p, date };
    const next = { ...sales, [date]: merged };
    setSales(next);
    save.report("매출 기록", saveSales(next), () =>
      save.report("매출 기록", saveSales(next)),
    );
    /**
     * ★ 0 에서 값이 들어오는 **전이**만 남긴다.
     *
     * `patch` 는 `onChange` 라 글자마다 불린다. 그대로 남기면 "1250000" 을
     * 넣는 동안 7건이 쌓인다. 재고 싶은 것은 **"마감을 실제로 넣는가"** 이지
     * 몇 번 눌렀나가 아니다.
     *
     * ★ 칸별로 따로 남기는 이유: 총매출을 먼저 넣으면 그 순간 재료비는
     *   아직 0 이다. 한 건에 몰아 담으면 "재료비까지 넣었나" 가 항상
     *   거짓으로 찍힌다. 칸마다 남기면 하루 최대 3건이고, **며칠 중
     *   며칠에 재료비까지 넣었나** 를 셀 수 있다 — 재료비를 빠뜨리면
     *   `순익` 이 조용히 낙관적으로 나온다.
     *
     * 금액은 담지 않는다. 영업 정보이고 "채워졌는가" 를 세는 데 필요 없다.
     */
    for (const f of ["total", "count", "material"] as const) {
      if (!(cur[f] > 0) && merged[f] > 0) {
        logEvent("매출_입력", { date, field: f });
      }
    }
  }

  const day = getDay(sales, pick);
  const labor = laborOn(pick);
  /* 하루치 고정비 — 월 고정비 ÷ 월 영업일수. 안 넣었으면 0 이고,
     그때 `p.fixedMissing` 이 true 라 화면이 이름을 바꿔 부른다 */
  const fixedDay = dailyFixed(settings.monthlyFixed, settings.openDaysPerMonth);
  const p = profitOf(day, labor.cost, fixedDay);

  const monday = mondayOf(new Date(pick + "T00:00:00"));
  const week = weekDays(monday);
  const weekDates = week.map(ymd);
  const weekSum = sumRange(sales, weekDates);
  const weekLabor = weekDates.reduce((s, d) => s + laborOn(d).cost, 0);
  const weekProfit = profitOf(
    { ...weekSum, date: weekDates[0], note: "" },
    weekLabor,
    /* ★ 주간은 고정비를 **영업한 날 수만큼** 뺀다. 7 을 곱하면 쉬는 날에도
       고정비를 문 것이 되고, 반대로 하루치만 빼면 주간 순익이 부풀려진다.
       매출이 0 인 날은 안 연 날로 본다 */
    fixedDay * weekDates.filter((d) => (sales[d]?.total ?? 0) > 0).length,
  );

  return (
    <Screen
      title="매출"
      storeName={storeName}
      saved={save.saved}
      saveFailed={save.failures}
      wide
    >
      <div className="mt-4 flex gap-2">
        <Chip on={tab === "day"} onClick={() => setTab("day")}>
          하루
        </Chip>
        <Chip on={tab === "week"} onClick={() => setTab("week")}>
          이번 주
        </Chip>
      </div>

      {tab === "day" ? (
        <div className="mt-4 flex flex-col gap-4">
          {/* ---------- 날짜 ---------- */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              className={BTN}
              onClick={() => {
                const d = new Date(pick + "T00:00:00");
                d.setDate(d.getDate() - 1);
                setPick(ymd(d));
              }}
            >
              ‹ 어제
            </button>
            <input
              type="date"
              value={pick}
              onChange={(e) => e.target.value && setPick(e.target.value)}
              aria-label="날짜"
              className="rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-[15px] font-bold dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              className={BTN}
              disabled={pick >= ymd(today)}
              onClick={() => {
                const d = new Date(pick + "T00:00:00");
                d.setDate(d.getDate() + 1);
                if (ymd(d) <= ymd(today!)) setPick(ymd(d));
              }}
            >
              내일 ›
            </button>
          </div>

          {/* ---------- 입력 ---------- */}
          <Card title="마감 입력" note="세 칸만 넣으면 됩니다. 인건비는 출퇴근 기록에서 자동으로 나옵니다.">
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                  총매출
                </span>
                <div className="mt-1">
                  <NumField
                    label="총매출"
                    value={day.total}
                    onChange={(v) => patch(pick, { total: v })}
                    placeholder="1250000"
                    suffix="원"
                  />
                </div>
              </label>
              <label>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                  결제 건수
                </span>
                <div className="mt-1">
                  <NumField
                    label="결제 건수"
                    value={day.count}
                    onChange={(v) => patch(pick, { count: v })}
                    placeholder="180"
                    suffix="건"
                  />
                </div>
              </label>
              <label>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                  재료비 (발주 금액)
                </span>
                <div className="mt-1">
                  <NumField
                    label="재료비"
                    value={day.material}
                    onChange={(v) => patch(pick, { material: v })}
                    placeholder="350000"
                    suffix="원"
                  />
                </div>
              </label>
            </div>
          </Card>

          {/* ---------- 결과 ---------- */}
          <section
            className={[
              "rounded-2xl border-2 p-4",
              p.left >= 0
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
            ].join(" ")}
          >
            <h2 className="text-[15px] font-bold">
              {label(new Date(pick + "T00:00:00"))} 하루 순익
              {/* ★ 고정비를 안 넣었으면 그 사실을 **괄호 한 마디로** 붙인다.
                  0 은 «고정비 없음» 이 아니라 «아직 안 넣음» 이라 그냥 「순익」
                  이라고 부르면 안 되는데, 문장으로 늘어놓으면 화면이 무거워진다 */}
              {p.fixedMissing && (
                <span className="ml-1 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                  (고정비 전)
                </span>
              )}
            </h2>
            <p className="mt-1 font-mono text-[32px] font-bold tabular-nums">
              {won(p.left)}
              <span className="ml-1 text-[16px]">원</span>
            </p>

            <div className="mt-3 border-t border-black/10 pt-2 dark:border-white/10">
              <Row label="매출" value={`${won(p.sales)}원`} />
              <Row
                label={`재료비 ${day.total > 0 ? `(${pct(p.material, p.sales)}%)` : ""}`}
                value={`− ${won(p.material)}원`}
              />
              <Row
                label={
                  <>
                    인건비 {day.total > 0 && `(${pct(p.labor, p.sales)}%)`}
                    <span className="ml-1 text-zinc-400">
                      {hoursLabel(labor.minutes)}
                    </span>
                  </>
                }
                value={`− ${won(p.labor)}원`}
              />
              {!p.fixedMissing && (
                <Row
                  label={
                    <>
                      고정비 {day.total > 0 && `(${pct(p.fixed, p.sales)}%)`}
                      <span className="ml-1 text-zinc-400">
                        월 {won(settings.monthlyFixed)}원 ÷ {settings.openDaysPerMonth}일
                      </span>
                    </>
                  }
                  value={`− ${won(p.fixed)}원`}
                />
              )}
              {p.perCustomer !== null && (
                <Row label="객단가" value={`${won(p.perCustomer)}원`} />
              )}
            </div>
          </section>

          {labor.noWage.length > 0 && (
            <Caveat>
              시급이 없는 직원(<b>{labor.noWage.join(", ")}</b>)이 근무한 날입니다.
              그만큼 인건비가 실제보다 적고, 하루 순익이 실제보다 많게 보입니다.{" "}
              <Link href="/contracts" className="underline">
                시급 넣기
              </Link>
            </Caveat>
          )}

          {/* ★ 고정비 — 매달 거의 안 바뀌므로 **한 번 넣으면 끝**이다.
              그래서 접어 둔다. 안 넣었을 때만 한 줄로 권한다 —
              마감할 때마다 보라고 카드로 펴 두면 화면만 무거워진다 */}
          <details className="group mt-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] [&::-webkit-details-marker]:hidden">
              <span>
                {p.fixedMissing ? (
                  <>
                    <b>고정비를 넣으면 «고정비 전»이 없어집니다</b>
                    <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                      임대료·공과금 등, 한 번만
                    </span>
                  </>
                ) : (
                  <>
                    월 고정비 <b>{won(settings.monthlyFixed)}원</b>
                    <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                      · 하루 {won(fixedDay)}원
                    </span>
                  </>
                )}
              </span>
              <span aria-hidden className="text-[11px] text-zinc-400 transition-transform group-open:rotate-180">
                ▼
              </span>
            </summary>
            <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 px-3 pb-3 pt-3 dark:border-zinc-800">
              <label>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                  한 달 고정비
                </span>
                <div className="mt-1">
                  <NumField
                    label="한 달 고정비"
                    value={settings.monthlyFixed}
                    onChange={(v) => {
                      const next = { ...settings, monthlyFixed: v };
                      setSettings(next);
                      save.report("고정비", saveSettings(next));
                    }}
                    placeholder="3500000"
                    suffix="원"
                  />
                </div>
              </label>
              <label>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                  한 달 영업일수
                </span>
                <div className="mt-1">
                  <NumField
                    label="한 달 영업일수"
                    value={settings.openDaysPerMonth}
                    onChange={(v) => {
                      const next = { ...settings, openDaysPerMonth: v };
                      setSettings(next);
                      save.report("영업일수", saveSettings(next));
                    }}
                    placeholder="26"
                    suffix="일"
                  />
                </div>
              </label>
            </div>
          </details>

          {labor.minutes === 0 && day.total > 0 && (
            <Caveat>
              이 날 출퇴근 기록이 없어서 인건비가 0원으로 잡혔습니다.{" "}
              <Link href="/attendance" className="underline">
                출퇴근 기록 넣기
              </Link>
            </Caveat>
          )}

          <label className="block">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">메모</span>
            <input
              value={day.note}
              onChange={(e) => patch(pick, { note: e.target.value })}
              placeholder="비, 근처 행사, 기계 고장 등 — 나중에 왜 그랬는지 알려면 필요합니다"
              aria-label="메모"
              className="mt-1 w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[16px] outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
      ) : (
        /* ============ 이번 주 ============ */
        <div className="mt-4 flex flex-col gap-4">
          <Card title={`${label(week[0])} ~ ${label(week[6])}`}>
            <div className="mt-1">
              <Row label="매출" value={`${won(weekProfit.sales)}원`} />
              <Row
                label={`재료비 (${pct(weekProfit.material, weekProfit.sales)}%)`}
                value={`− ${won(weekProfit.material)}원`}
              />
              <Row
                label={`인건비 (${pct(weekProfit.labor, weekProfit.sales)}%)`}
                value={`− ${won(weekProfit.labor)}원`}
              />
              {!weekProfit.fixedMissing && (
                <Row
                  label={`고정비 (${pct(weekProfit.fixed, weekProfit.sales)}%)`}
                  value={`− ${won(weekProfit.fixed)}원`}
                />
              )}
              <Row
                label={weekProfit.fixedMissing ? "순익 (고정비 전)" : "순익"}
                value={`${won(weekProfit.left)}원`}
                strong
              />
              {weekProfit.perCustomer !== null && (
                <Row label="객단가" value={`${won(weekProfit.perCustomer)}원`} />
              )}
            </div>
          </Card>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[600px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">날짜</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">매출</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">재료비</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">인건비</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">순익</th>
                </tr>
              </thead>
              <tbody>
                {week.map((d) => {
                  const date = ymd(d);
                  const row = getDay(sales, date);
                  const l = laborOn(date);
                  /* 안 연 날(매출 0)에는 고정비를 안 뺀다 — 빼면 쉬는 날마다
                     적자가 찍혀서 표가 읽을 수 없게 된다 */
                  const pr = profitOf(row, l.cost, row.total > 0 ? fixedDay : 0);
                  const empty = row.total === 0 && l.cost === 0;
                  return (
                    <tr
                      key={date}
                      className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                      onClick={() => {
                        setPick(date);
                        setTab("day");
                      }}
                    >
                      <td className="px-3 py-2.5 font-semibold">{label(d)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {empty ? "—" : won(row.total)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {empty ? "—" : won(row.material)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {empty ? "—" : won(l.cost)}
                      </td>
                      <td
                        className={[
                          "px-3 py-2.5 text-right font-mono font-bold tabular-nums",
                          empty ? "" : pr.left < 0 ? "text-red-600 dark:text-red-400" : "",
                        ].join(" ")}
                      >
                        {empty ? "—" : won(pr.left)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ★ 한 줄로 줄였다 (2026-09-12). 빠진 것을 말하는 건 그대로 하되,
          문단으로 늘어놓으면 매일 여는 화면이 무거워져서 아무도 안 읽는다 */}
      <Caveat>
        {p.fixedMissing
          ? "고정비 전이라 실제보다 높게 나옵니다. "
          : "세금·감가상각은 아직 빠져 있습니다. "}
        재료비는 그날 발주 금액입니다.{" "}
        <Link href="/cost" className="underline">
          원가 화면
        </Link>
      </Caveat>
    </Screen>
  );
}
