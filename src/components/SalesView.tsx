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
import { loadSettings, type Settings } from "@/lib/settings";
import { getDay, loadSales, profitOf, saveSales, sumRange, type SalesData } from "@/lib/sales";
import type { Shift } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 매출 보고.
 *
 * 매출만 보여주는 화면은 만들 이유가 없다 — 포스기가 이미 안다.
 * 이 화면의 존재 이유는 **빼기** 하나다.
 *
 *      매출 − 재료비 − 인건비 = 순수익
 *
 * 인건비는 안 물어본다. 출퇴근 기록과 계약서 시급에서 그냥 나온다.
 * 사장님이 마감할 때 넣는 건 매출·건수·재료비 셋뿐이다.
 * 그 이상 요구하면 셋째 날부터 안 쓴다.
 *
 * ⚠ 여기서 말하는 "순수익"은 재료비·인건비만 뺀 것이다. 임대료·공과금·카드수수료·세금이
 *   빠져 있다. 그래서 화면에서도 순이익이라고 쓰지 않는다.
 * ------------------------------------------------------------------ */

export default function SalesView({
  storeName,
  shifts,
}: {
  storeName: string;
  shifts: Shift[];
}) {
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
  }, []);

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
     *   `순수익` 이 조용히 낙관적으로 나온다.
     *
     * 금액은 담지 않는다. 영업 정보이고 "채워졌는가" 를 세는 데 필요 없다.
     */
    for (const f of ["total", "count", "material"] as const) {
      if (!(cur[f] > 0) && merged[f] > 0) {
        logEvent("sales_close", { date, field: f });
      }
    }
  }

  const day = getDay(sales, pick);
  const labor = laborOn(pick);
  const p = profitOf(day, labor.cost);

  const monday = mondayOf(new Date(pick + "T00:00:00"));
  const week = weekDays(monday);
  const weekDates = week.map(ymd);
  const weekSum = sumRange(sales, weekDates);
  const weekLabor = weekDates.reduce((s, d) => s + laborOn(d).cost, 0);
  const weekProfit = profitOf(
    { ...weekSum, date: weekDates[0], note: "" },
    weekLabor,
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
            <h2 className="text-[15px] font-bold">{label(new Date(pick + "T00:00:00"))} 순수익</h2>
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
              {p.perCustomer !== null && (
                <Row label="객단가" value={`${won(p.perCustomer)}원`} />
              )}
            </div>
          </section>

          {labor.noWage.length > 0 && (
            <Caveat>
              시급이 없는 직원(<b>{labor.noWage.join(", ")}</b>)이 근무한 날입니다.
              그만큼 인건비가 실제보다 적고, 순수익은 실제보다 많게 보입니다.{" "}
              <Link href="/contracts" className="underline">
                시급 넣기
              </Link>
            </Caveat>
          )}

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
              <Row label="순수익" value={`${won(weekProfit.left)}원`} strong />
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
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">순수익</th>
                </tr>
              </thead>
              <tbody>
                {week.map((d) => {
                  const date = ymd(d);
                  const row = getDay(sales, date);
                  const l = laborOn(date);
                  const pr = profitOf(row, l.cost);
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

      <Caveat>
        <b>여기서 말하는 &quot;순수익&quot;은 재료비·인건비만 뺀 것입니다.</b> 임대료·공과금·카드
        수수료·세금·감가상각이 빠져 있습니다. 재료비도 그날 발주 금액이라
        실제로 쓴 양과는 다릅니다(로스·재고 변동). 메뉴별 재료비는{" "}
        <Link href="/cost" className="underline">
          원가 화면
        </Link>
        에서 봅니다.
      </Caveat>
    </Screen>
  );
}
