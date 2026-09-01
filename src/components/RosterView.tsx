"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackButton from "@/components/BackButton";
import {
  buildEmailBody,
  label,
  loadRoster,
  mondayOf,
  newStaffId,
  OFF,
  saveRoster,
  weekDays,
  ymd,
  type RosterData,
} from "@/lib/roster";
import type { Shift } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 근무표 작성 + 발송.
 *
 * 발송은 메일 앱을 열어주는 방식이다. 우리가 대신 보내지 않는다.
 * 보내는 사람이 내용을 눈으로 확인하고 본인 계정으로 보내야,
 * 직원이 받았을 때 누가 보낸 건지 분명하고 답장도 사장님에게 간다.
 * ------------------------------------------------------------------ */

const inputBase =
  "rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900";

export default function RosterView({
  shifts,
  storeName,
}: {
  shifts: Shift[];
  storeName: string;
}) {
  const [data, setData] = useState<RosterData>({ staff: [], assign: {} });
  const [monday, setMonday] = useState<Date | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setData(loadRoster());
    setMonday(mondayOf(new Date()));
  }, []);

  const days = useMemo(() => (monday ? weekDays(monday) : []), [monday]);

  const persist = useCallback((next: RosterData) => {
    setData(next);
    saveRoster(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }, []);

  function addStaff() {
    if (!name.trim()) return;
    persist({
      ...data,
      staff: [
        ...data.staff,
        {
          id: newStaffId(),
          name: name.trim(),
          email: email.trim(),
          role: role.trim(),
        },
      ],
    });
    setName("");
    setEmail("");
    setRole("");
  }

  function removeStaff(id: string) {
    const assign = { ...data.assign };
    delete assign[id];
    persist({ staff: data.staff.filter((s) => s.id !== id), assign });
  }

  function setShift(staffId: string, date: string, shift: string) {
    persist({
      ...data,
      assign: {
        ...data.assign,
        [staffId]: { ...(data.assign[staffId] ?? {}), [date]: shift },
      },
    });
  }

  const withEmail = data.staff.filter((s) => s.email);

  function sendMail() {
    if (days.length === 0) return;
    const body = buildEmailBody(storeName, days, data);
    const subject = `[${storeName}] 근무표 ${label(days[0])}~${label(days[6])}`;
    // 받는 사람을 숨은참조로 넣는다. 직원끼리 서로의 주소가 노출되지 않게.
    const bcc = withEmail.map((s) => s.email).join(",");
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }

  function copyText() {
    if (days.length === 0) return;
    const body = buildEmailBody(storeName, days, data);
    void navigator.clipboard
      .writeText(body)
      .then(() => window.alert("근무표를 복사했습니다. 단톡방에 붙여넣으세요."))
      .catch(() => window.prompt("아래 내용을 복사하세요", body));
  }

  function shiftWeek(delta: number) {
    if (!monday) return;
    const d = new Date(monday);
    d.setDate(d.getDate() + delta * 7);
    setMonday(d);
  }

  if (!monday) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-[900px] px-4 py-8">
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[900px] bg-zinc-50 px-4 py-6 pb-24 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {storeName}
          </p>
          <h1 className="text-xl font-bold">근무표</h1>
        </div>
        {saved && (
          <span className="shrink-0 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
            저장됨
          </span>
        )}
      </div>

      {/* ---------- 주 이동 ---------- */}
      <div className="mt-5 flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-semibold dark:border-zinc-700"
        >
          ‹ 지난주
        </button>
        <span className="text-[14px] font-bold">
          {label(days[0])} ~ {label(days[6])}
        </span>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-semibold dark:border-zinc-700"
        >
          다음주 ›
        </button>
      </div>

      {/* ---------- 직원 추가 ---------- */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-[15px] font-bold">직원 추가</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            aria-label="직원 이름"
            className={`${inputBase} w-32`}
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="담당 (예: 제빵)"
            aria-label="담당"
            className={`${inputBase} w-36`}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 (선택)"
            aria-label="이메일"
            className={`${inputBase} min-w-[200px] flex-1`}
          />
          <button
            type="button"
            onClick={addStaff}
            disabled={!name.trim()}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-[15px] font-bold text-white active:bg-orange-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            추가
          </button>
        </div>
      </section>

      {/* ---------- 근무표 ---------- */}
      {data.staff.length === 0 ? (
        <p className="mt-8 text-center text-[14px] text-zinc-500 dark:text-zinc-400">
          직원을 추가하면 근무표가 만들어집니다.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="sticky left-0 z-10 w-[120px] min-w-[120px] bg-white px-3 py-2.5 text-left font-bold dark:bg-zinc-900">
                  직원
                </th>
                {days.map((d) => (
                  <th
                    key={ymd(d)}
                    className={[
                      "min-w-[104px] px-2 py-2.5 font-bold",
                      d.getDay() === 0
                        ? "text-red-600 dark:text-red-400"
                        : d.getDay() === 6
                          ? "text-blue-600 dark:text-blue-400"
                          : "",
                    ].join(" ")}
                  >
                    {label(d)}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <th className="sticky left-0 z-10 w-[120px] min-w-[120px] bg-white px-3 py-2 text-left dark:bg-zinc-900">
                    <span className="block truncate font-bold">{s.name}</span>
                    <span className="block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      {s.role || "—"}
                      {!s.email && " · 메일 없음"}
                    </span>
                  </th>
                  {days.map((d) => {
                    const key = ymd(d);
                    const cur = data.assign[s.id]?.[key] ?? OFF;
                    return (
                      <td key={key} className="px-1.5 py-1.5">
                        <select
                          value={cur}
                          onChange={(e) => setShift(s.id, key, e.target.value)}
                          aria-label={`${s.name} ${label(d)} 근무`}
                          className={[
                            "w-full rounded-lg border px-1.5 py-2 text-[12px] font-semibold outline-none",
                            cur
                              ? "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
                              : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950",
                          ].join(" ")}
                        >
                          <option value={OFF}>휴무</option>
                          {shifts.map((sh) => (
                            <option key={sh.id} value={sh.name}>
                              {sh.name} {sh.start}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  <td className="px-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`${s.name} 님을 명단에서 뺄까요?`))
                          removeStaff(s.id);
                      }}
                      aria-label={`${s.name} 삭제`}
                      className="px-2 text-[16px] text-zinc-400"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- 발송 ---------- */}
      {data.staff.length > 0 && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-[15px] font-bold">보내기</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            메일 앱이 내용까지 채워진 채로 열립니다.{" "}
            <b>보내기는 직접 누르셔야 합니다.</b> 받는 사람은 숨은참조로 넣어서
            직원끼리 서로 주소가 보이지 않습니다.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendMail}
              disabled={withEmail.length === 0}
              className="rounded-xl bg-zinc-900 px-5 py-3 text-[15px] font-bold text-white active:bg-zinc-700 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:bg-zinc-700"
            >
              메일로 보내기 ({withEmail.length}명)
            </button>
            <button
              type="button"
              onClick={copyText}
              className="rounded-xl border-2 border-zinc-300 px-5 py-3 text-[15px] font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              복사 (카톡용)
            </button>
          </div>

          {withEmail.length === 0 && (
            <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
              이메일이 입력된 직원이 없습니다. 카톡용 복사를 쓰세요.
            </p>
          )}
        </section>
      )}

      <p className="mt-6 rounded-xl bg-zinc-100 px-3.5 py-3 text-[12px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        직원 명단과 근무표는 <b>이 기기에만</b> 저장됩니다. 다른 태블릿에서는
        보이지 않습니다. 여러 기기에서 함께 쓰려면 서버 연결(배포 직전 작업)이
        필요합니다.
      </p>
    </main>
  );
}
