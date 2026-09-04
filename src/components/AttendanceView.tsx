"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BTN, BTN_PRIMARY, Card, Caveat, Chip, Empty, INPUT, NumField, Row, Screen } from "@/components/ui";
import { won } from "@/lib/store";
import { label, loadRoster, mondayOf, weekDays, ymd, type RosterData } from "@/lib/roster";
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
import { contractOf, loadContracts, type Contract } from "@/lib/contracts";
import { InlineUnlock, useOwnerOpen } from "@/components/OwnerGate";
import { loadSettings, type Settings } from "@/lib/settings";
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

export default function AttendanceView({
  storeName,
  shifts,
}: {
  storeName: string;
  shifts: Shift[];
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [now, setNow] = useState<Date | null>(null);
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [punches, setPunches] = useState<PunchData>({});
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [monday, setMonday] = useState<Date | null>(null);
  const [saved, setSaved] = useState(false);
  // 출퇴근은 직원이 찍는 화면이라 잠글 수 없다. 돈만 가린다
  const owner = useOwnerOpen();

  useEffect(() => {
    const d = new Date();
    setNow(d);
    setMonday(mondayOf(d));
    setRoster(loadRoster());
    setPunches(loadPunches());
    setContracts(loadContracts());
    setSettings(loadSettings());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function commit(next: PunchData) {
    setPunches(next);
    if (savePunches(next)) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    }
  }

  const days = useMemo(() => (monday ? weekDays(monday) : []), [monday]);

  if (!now || !roster || !settings || !monday) {
    return (
      <Screen title="출퇴근" storeName={storeName}>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  if (roster.staff.length === 0) {
    return (
      <Screen title="출퇴근" storeName={storeName}>
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
  }

  function edit(staffId: string, patch: Partial<ReturnType<typeof newPunch>>) {
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
    <Screen title="출퇴근 · 근태" storeName={storeName} saved={saved} wide>
      {/* ---------- 탭 ---------- */}
      <div className="mt-4 flex gap-2">
        <Chip on={tab === "today"} onClick={() => setTab("today")}>
          오늘 ({label(now)})
        </Chip>
        <Chip on={tab === "week"} onClick={() => setTab("week")}>
          이번 주 · 근태
        </Chip>
      </div>

      {tab === "today" ? (
        /* ============ 오늘 ============ */
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
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

                  {/* 큰 버튼 두 개 */}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => stamp(s.id, "in")}
                      className={[
                        "flex-1 rounded-xl py-4 text-[15px] font-bold",
                        p?.inAt
                          ? "border-2 border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                          : "bg-orange-500 text-white active:bg-orange-600",
                      ].join(" ")}
                    >
                      {p?.inAt ? `출근 ${p.inAt}` : "출근"}
                    </button>
                    <button
                      type="button"
                      onClick={() => stamp(s.id, "out")}
                      disabled={!p?.inAt}
                      className={[
                        "flex-1 rounded-xl py-4 text-[15px] font-bold",
                        !p?.inAt
                          ? "border-2 border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600"
                          : p?.outAt
                            ? "border-2 border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                            : "bg-zinc-900 text-white active:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900",
                      ].join(" ")}
                    >
                      {p?.outAt ? `퇴근 ${p.outAt}` : "퇴근"}
                    </button>
                  </div>

                  {p?.inAt && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="flex items-center gap-1.5">
                        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                          출근
                        </span>
                        <input
                          value={p.inAt}
                          onChange={(e) => edit(s.id, { inAt: e.target.value })}
                          placeholder="07:30"
                          aria-label={`${s.name} 출근 시각`}
                          className={`${INPUT} w-24 text-center font-mono`}
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                          퇴근
                        </span>
                        <input
                          value={p.outAt}
                          onChange={(e) => edit(s.id, { outAt: e.target.value })}
                          placeholder="15:30"
                          aria-label={`${s.name} 퇴근 시각`}
                          className={`${INPUT} w-24 text-center font-mono`}
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
                            onChange={(v) => edit(s.id, { breakMin: v })}
                            suffix="분"
                          />
                        </div>
                      </label>
                    </div>
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
                  <th className="px-3 py-2.5 text-left font-semibold">직원</th>
                  {days.map((d) => (
                    <th key={ymd(d)} className="px-1.5 py-2.5 text-center font-semibold">
                      {d.getMonth() + 1}/{d.getDate()}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">근로</th>
                  {owner.open && (
                    <th className="px-3 py-2.5 text-right font-semibold">인건비(추정)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {weekly.map(({ staff, results, pay, contract }) => (
                  <tr key={staff.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold">{staff.name}</span>
                      {owner.open && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {contract && contract.hourlyWage > 0
                            ? `${won(contract.hourlyWage)}원/시`
                            : "시급 없음"}
                        </span>
                      )}
                    </td>
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
