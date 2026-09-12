"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/copyText";
import BackButton from "@/components/BackButton";
import MonthPicker from "@/components/MonthPicker";
import { SaveFailed, useSaveState } from "@/components/ui";
import {
  buildEmailBody,
  label,
  loadRoster,
  mondayOf,
  newStaffId,
  OFF,
  saveRoster,
  SECTIONS,
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

/** 공용 태블릿이라 기본으로 가린다. 앞뒤 몇 글자만 남겨 누구 것인지는 알아보게 */
function mask(v: string): string {
  const t = v.trim();
  if (t.length <= 4) return "•".repeat(t.length);
  return t.slice(0, 2) + "•".repeat(Math.max(3, t.length - 4)) + t.slice(-2);
}

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
  /* 달력은 접혀 있다가 날짜를 누르면 열린다 — 늘 펴 두면 근무표가 아래로 밀린다 */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [section, setSection] = useState("");
  const [phone, setPhone] = useState("");
  const save = useSaveState();
  // 연락처는 기본으로 가린다. 공용 태블릿이라 다음 사람이 그대로 본다.
  const [showContacts, setShowContacts] = useState(false);
  // 메일 본문에 연락처를 넣을지. 기본은 넣지 않는다 (bcc로 가린 의미를 지키려고)
  const [mailContacts, setMailContacts] = useState(false);

  useEffect(() => {
    setData(loadRoster());
    setMonday(mondayOf(new Date()));
  }, []);

  const days = useMemo(() => (monday ? weekDays(monday) : []), [monday]);

  const persist = useCallback(
    (next: RosterData) => {
      setData(next);
      // ★ 근무표가 안 남으면 근태(계획 − 실제)를 아예 못 만든다
      save.report("근무표", saveRoster(next), () =>
        save.report("근무표", saveRoster(next)),
      );
    },
    [save],
  );

  function addStaff() {
    if (!name.trim()) return;
    persist({
      ...data,
      staff: [
        ...data.staff,
        {
          id: newStaffId(),
          section: section.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
      ],
    });
    setName("");
    setEmail("");
    setPhone("");
    // 섹션은 남겨둔다. 같은 섹션 사람을 연달아 넣는 경우가 많다
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
    const body = buildEmailBody(storeName, days, data, {
      includeContacts: mailContacts,
    });
    const subject = `[${storeName}] 근무표 ${label(days[0])}~${label(days[6])}`;
    // 받는 사람을 숨은참조로 넣는다. 직원끼리 서로의 주소가 노출되지 않게.
    const bcc = withEmail.map((s) => s.email).join(",");
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }

  function copyForChat() {
    if (days.length === 0) return;
    const body = buildEmailBody(storeName, days, data, {
      includeContacts: mailContacts,
    });
    void copyText(body, "아래 근무표를 복사해 단톡방에 붙여넣으세요").then((r) => {
      if (r === "copied") window.alert("근무표를 복사했습니다. 단톡방에 붙여넣으세요.");
    });
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
        {save.saved && (
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
          >
            저장됨
          </span>
        )}
      </div>

      <SaveFailed failures={save.failures} />

      {/* ---------- 주 이동 ----------
          ★ 가운데 날짜를 누르면 달력이 열린다 (사장님 요청 2026-09-12).
            [지난주][다음주] 두 버튼만 있으면 3주 뒤 근무표를 짜려고 세 번
            눌러야 하고, 그동안 지금 어디인지는 글자로만 읽어야 했다. */}
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-semibold dark:border-zinc-700"
          >
            ‹ 지난주
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            className="rounded-lg px-2 py-1 text-[14px] font-bold active:bg-zinc-100 dark:active:bg-zinc-800"
          >
            {label(days[0])} ~ {label(days[6])}
            <span aria-hidden className="ml-1.5 text-[11px] text-zinc-400">
              달력 ▼
            </span>
          </button>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-semibold dark:border-zinc-700"
          >
            다음주 ›
          </button>
        </div>

        {pickerOpen && (
          <MonthPicker
            value={monday}
            onPick={setMonday}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* ---------- 직원 추가 ---------- */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-[15px] font-bold">직원 추가</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {SECTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSection(sec)}
              className={[
                "rounded-lg border-2 px-3 py-1.5 text-[13px] font-semibold",
                section === sec
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
              ].join(" ")}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="섹션"
            aria-label="섹션"
            className={`${inputBase} w-28`}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            aria-label="직원 이름"
            className={`${inputBase} w-32`}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            aria-label="이메일"
            className={`${inputBase} min-w-[200px] flex-1`}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="전화번호"
            aria-label="전화번호"
            className={`${inputBase} w-40`}
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

      {/* ---------- 직원 명단 (메일에 그대로 들어간다) ---------- */}
      {data.staff.length > 0 && (
        <section className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full border-collapse text-[13px]">
            <caption className="px-4 pt-3 text-left text-[15px] font-bold">
              <span className="flex flex-wrap items-center gap-2">
                직원 명단
                <span className="text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                  연락처는 가려져 있습니다
                </span>
                <button
                  type="button"
                  onClick={() => setShowContacts((v) => !v)}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[12px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {showContacts ? "가리기" : "연락처 보기"}
                </button>
              </span>
            </caption>
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th scope="col" className="px-3 py-2 text-left font-semibold">섹션</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">이름</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">이메일</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">전화번호</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 font-semibold">{s.section || "—"}</td>
                  <td className="px-3 py-2 font-bold">{s.name}</td>
                  <td
                    className={[
                      "px-3 py-2",
                      s.email ? "" : "text-zinc-400",
                    ].join(" ")}
                  >
                    {s.email ? (showContacts ? s.email : mask(s.email)) : "없음"}
                  </td>
                  <td
                    className={[
                      "px-3 py-2 tabular-nums",
                      s.phone ? "" : "text-zinc-400",
                    ].join(" ")}
                  >
                    {s.phone ? (showContacts ? s.phone : mask(s.phone)) : "없음"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
                <th scope="col" className="sticky left-0 z-10 w-[120px] min-w-[120px] bg-white px-3 py-2.5 text-left font-bold dark:bg-zinc-900">
                  직원
                </th>
                {days.map((d) => (
                  <th
                    key={ymd(d)}
                    scope="col"
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
                <th scope="col" className="w-10">
                  <span className="sr-only">지우기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <th scope="row" className="sticky left-0 z-10 w-[120px] min-w-[120px] bg-white px-3 py-2 text-left font-normal dark:bg-zinc-900">
                    <span className="block truncate font-bold">{s.name}</span>
                    <span className="block truncate text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      {s.section || "—"}
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
            메일 한 통에 <b>직원 명단(섹션·이름·이메일·전화번호)</b>과{" "}
            <b>이번 주 근무표</b>가 함께 들어가고, 전 직원에게 한꺼번에
            나갑니다. 메일 앱이 내용까지 채워진 채로 열리고,{" "}
            <b>보내기는 직접 누르셔야 합니다.</b>
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
              onClick={copyForChat}
              className="rounded-xl border-2 border-zinc-300 px-5 py-3 text-[15px] font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              복사 (카톡용)
            </button>
          </div>

          <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 dark:border-zinc-800">
            <input
              type="checkbox"
              checked={mailContacts}
              onChange={(e) => setMailContacts(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500"
            />
            <span className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              <b>명단에 이메일·전화번호도 넣기</b>
              <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                기본은 <b>섹션·이름만</b> 나갑니다. 이걸 켜면 받는 직원 전원이
                서로의 연락처를 보게 됩니다. 받는 사람은 숨은참조로 가리지만
                본문에 적히면 가린 의미가 없습니다.
              </span>
            </span>
          </label>

          {withEmail.length === 0 && (
            <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
              이메일이 입력된 직원이 없습니다. 아래 <b>복사</b>를 눌러 단톡방에
              붙여넣으세요.
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
