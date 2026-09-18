"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { copyText } from "@/lib/copyText";
import BackButton from "@/components/BackButton";
import MonthPicker from "@/components/MonthPicker";
import { INPUT, SaveFailed, useSaveState } from "@/components/ui";
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
import ShiftEditor from "@/components/ShiftEditor";
import WorkSwitch from "@/components/WorkSwitch";
import { pullRoster, pushRoster } from "@/lib/serverSync";
import {
  applyShiftEdits,
  loadShiftEdits,
  type ShiftEdits,
} from "@/lib/shiftEdit";
import type { Shift } from "@/lib/types";
import { maskEmail, maskPhone } from "@/lib/maskContact";
import { sendViaServer, type Failed } from "@/lib/rosterMail";
import { SKIP, hasRows, pullStaff, pushStaff } from "@/lib/serverSync";

/** 「메일로 보내기」 의 진행 상태. 서버 메일(Resend)이 설정돼 있을 때만 움직인다 */
type MailState =
  | { s: "idle" }
  | { s: "sending" }
  | { s: "sent"; sent: string[]; failed: Failed[] }
  | { s: "error"; reason: string };

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
  shifts: seedShifts,
  storeName,
}: {
  shifts: Shift[];
  storeName: string;
}) {
  const [data, setData] = useState<RosterData>({ staff: [], assign: {} });
  /* ★ 시드의 조 시간은 **기본값**이다. 매장이 고친 값이 있으면 그게 이긴다 */
  const [shiftEdits, setShiftEdits] = useState<ShiftEdits>({});
  const shifts = useMemo(
    () => applyShiftEdits(seedShifts, shiftEdits),
    [seedShifts, shiftEdits],
  );
  /* ★ 조 목록은 `shiftEdits` 가 채워진 뒤에야 최종값이 된다. 첫 effect 안에서
     쓰려면 클로저에 잡힌 옛 값이 아니라 **지금 값**이 필요하다 */
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;

  /* 어느 직원 줄을 고치는 중인가. 한 번에 하나만 — 공용 태블릿이라
     여러 줄이 동시에 입력 상태면 누가 무엇을 고쳤는지 알 수 없다 */
  const [editing, setEditing] = useState<string | null>(null);

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
  const [mailState, setMailState] = useState<MailState>({ s: "idle" });

  useEffect(() => {
    setData(loadRoster());
    setShiftEdits(loadShiftEdits());
    setMonday(mondayOf(new Date()));

    /* ★★ 직원을 **여기서 직접** 올린다 (2026-09-16).
       전에는 직원이 출퇴근·계약을 보낼 때 **딸려서만** 올라갔다. 그래서
       출퇴근도 계약도 0건인 매장은 직원 4명이 있어도 서버 `staff` 가 영영
       비어 있었다 — 사장님이 «폴더가 다 깡통» 이라고 본 상태의 절반이 이것이다.
       서버에 있으면 서버가 이기고(기기 바꿈), 비어 있으면 이 태블릿 것을 올린다.

       ★ 2026-09-16 — **배정(`assign`)도 같이** 받는다. 근무표는 주에 한 번
         짜는 것이라 잃으면 그 주를 통째로 다시 짜야 하고, 배정이 없으면
         근태(계획 − 실제)를 아예 못 만든다. */
    void pullRoster().then((server) => {
      if (server === null) return; // 로그인 안 함 — 지금까지와 같다
      if (hasRows(server.staff) || hasRows(server.assign)) {
        const local = loadRoster();
        /* 서버에 있는 것만 이긴다. 배정이 비어 있는데 덮으면
           **이 태블릿에서 짠 이번 주가 통째로 사라진다** */
        const merged: RosterData = {
          staff: hasRows(server.staff) ? server.staff : local.staff,
          assign: hasRows(server.assign) ? server.assign : local.assign,
        };
        saveRoster(merged);
        setData(merged);
        return;
      }
      const mine = loadRoster();
      if (hasRows(mine.staff) || hasRows(mine.assign)) sendUp(mine);
    });
  }, []);

  /* ★ 서버 보관은 태블릿 저장과 **따로 알린다** (출퇴근·계약과 같은 규칙).
     로그인 안 했으면 `SKIP` 이 와서 아무 말도 안 한다. */
  function sendUp(next: RosterData) {
    void pushRoster(next, shiftsRef.current).then((r) => {
      if (!r.ok && r.reason === SKIP) return;
      save.report("근무표(서버 보관)", r.ok, () => sendUp(next));
    });
  }

  const days = useMemo(() => (monday ? weekDays(monday) : []), [monday]);

  /* ★ 이름 가나다순 (2026-09-18 · 사장님 지적).
     저장 순서(넣은 차례)로 두면 사람이 늘수록 찾는 데 시간이 걸린다.
     `localeCompare("ko")` 를 쓴다 — 기본 비교는 «ㄱ» 보다 «ㅎ» 이 작게
     나오는 경우가 있어서 한글 정렬이 어긋난다.
     ⚠️ **저장 순서는 안 바꾼다.** 보이는 차례만 바꾼다 — `data.staff` 를
       정렬해서 저장하면 서버로 같은 줄이 계속 다시 올라간다. */
  const sortedStaff = useMemo(
    () => [...data.staff].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [data.staff],
  );

  const persist = useCallback(
    (next: RosterData) => {
      setData(next);
      // ★ 근무표가 안 남으면 근태(계획 − 실제)를 아예 못 만든다
      save.report("근무표", saveRoster(next), () =>
        save.report("근무표", saveRoster(next)),
      );
      sendUp(next);
    },
    [save],
  );

  function addStaff() {
    if (!name.trim()) return;
    const next = [
      ...data.staff,
      {
        id: newStaffId(),
        section: section.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      },
    ];
    persist({ ...data, staff: next });
    setName("");
    setEmail("");
    setPhone("");
    // 섹션은 남겨둔다. 같은 섹션 사람을 연달아 넣는 경우가 많다
    /* 서버로 보내는 것은 `persist` 가 한다 — 여기서 또 부르면 같은 것을
       두 번 보낸다 (2026-09-16 에 배정까지 같이 보내면서 한곳으로 모았다) */
  }

  /** 직원 한 명의 칸 하나를 고친다 (연락처·섹션) */
  function patchStaff(id: string, patch: Partial<(typeof data.staff)[number]>) {
    persist({
      ...data,
      staff: data.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function removeStaff(id: string) {
    const assign = { ...data.assign };
    delete assign[id];
    const staff = data.staff.filter((s) => s.id !== id);
    persist({ staff, assign });
    /* ⚠️ 서버 쪽 줄은 지우지 않는다 — `/api/data` 는 덮어쓰기만 한다.
       (늦게 연 기기가 다른 기기의 기록을 지우는 사고를 막기 위해서다)
       올리는 것은 위의 `persist` 가 이미 했다. */
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

  /**
   * 메일 앱을 연다.
   *
   * ★★ **본문을 주소에 안 싣는다** (2026-09-15 · 「아무 작동 안 하노」의 원인)
   *
   *   예전에는 `mailto:?...&body=<근무표 전체>` 를 만들었다. 본문이 649자면
   *   한글이 URL 인코딩되면서 주소가 **2,764자**가 된다(한 글자가 `%EC%9B%94`
   *   처럼 9바이트). Windows 의 mailto 한계는 대략 2,000자라 **넘으면 메일 앱이
   *   그냥 안 열린다 — 오류도 안 뜬다.** 눌러도 아무 일이 없던 게 이것이다.
   *
   *   그래서 주소에는 **받는 사람과 제목만** 싣고, 본문은 **클립보드에 담아
   *   붙여넣게** 한다. 길이에 상관없이 항상 열린다.
   *
   * ★ 복사를 **먼저** 하고 그 다음에 메일 앱을 연다. 순서를 바꾸면 창이
   *   넘어가면서 복사가 취소되는 브라우저가 있다.
   */
  async function sendMail() {
    if (days.length === 0) return;
    const body = buildEmailBody(storeName, days, data, {
      includeContacts: mailContacts,
    });
    const subject = `[${storeName}] 근무표 ${label(days[0])}~${label(days[6])}`;
    const to = withEmail.map((s) => s.email);

    /* 1) 서버 메일(Resend)이 설정돼 있으면 여기서 바로 나간다 — 한 사람에 한 통씩.
     *    결과(몇 명 갔고 누가 왜 못 받았나)는 아래 글상자에 그대로 쓴다 (2026-09-16) */
    setMailState({ s: "sending" });
    const r = await sendViaServer({ to, subject, text: body });
    if (r.kind === "sent") {
      setMailState({ s: "sent", sent: r.sent, failed: r.failed });
      return;
    }
    if (r.kind === "error") {
      setMailState({ s: "error", reason: r.reason });
      return;
    }

    /* 2) 설정이 없다 → 예전 길: 메일 앱을 연다.
     *    받는 사람을 숨은참조로 넣는다. 직원끼리 서로의 주소가 노출되지 않게. */
    setMailState({ s: "idle" });
    const bcc = to.join(",");

    const copied = await copyText(body, "아래 근무표를 메일에 붙여넣으세요");
    window.location.href = `mailto:?bcc=${encodeURIComponent(
      bcc,
    )}&subject=${encodeURIComponent(subject)}`;
    window.alert(
      copied === "copied"
        ? "메일 앱을 엽니다.\n근무표를 복사해 뒀으니 본문에 붙여넣기(Ctrl+V) 하세요."
        : "메일 앱을 엽니다.\n근무표는 아래 [복사] 를 눌러 붙여넣어 주세요.",
    );
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

      {/* ★ 출퇴근과 한 몸이다 (WorkSwitch 주석 참고) */}
      <WorkSwitch current="roster" />

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

      {/* ---------- 근무조 수정 ----------
          ★ 직원 추가보다 위에 둔다. 조를 먼저 정하고 사람을 배정하는 순서다. */}
      <ShiftEditor
        shifts={shifts}
        edits={shiftEdits}
        onChange={(next) => {
          setShiftEdits(next);
          // 이름이 바뀌면 근무표 배정도 옮겨졌다 — 화면의 표를 다시 읽는다
          setData(loadRoster());
        }}
      />

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
              {sortedStaff.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 font-semibold">
                    {editing === s.id ? (
                      <select
                        value={s.section}
                        aria-label={`${s.name} 섹션`}
                        onChange={(e) => patchStaff(s.id, { section: e.target.value })}
                        className={`${INPUT} py-1 text-[13px]`}
                      >
                        {SECTIONS.map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    ) : (
                      s.section || "—"
                    )}
                  </td>
                  {/* ★ 수정·삭제를 **이름 아래**에 둔다 (2026-09-16).
                      칸을 하나 더 만들었더니 표가 넘쳐서 가로로 밀어야 보였다 —
                      사장님이 «삭제가 없다» 고 한 것과 똑같은 일이 다시 났다.
                      이름 옆이면 누구를 고치는지도 분명하다. */}
                  <td className="px-3 py-2">
                    {editing === s.id ? (
                      /* ★ 이름도 고칠 수 있어야 한다. 못 고치면 오타 하나에
                         **지우고 다시 넣는** 수밖에 없는데, 그러면 id 가 바뀌어서
                         그 사람의 출퇴근·근로계약이 통째로 끊긴다 (3년 보존 대상). */
                      <input
                        type="text"
                        value={s.name}
                        aria-label="이름"
                        onChange={(e) => patchStaff(s.id, { name: e.target.value })}
                        className={`${INPUT} py-1 text-[13px] font-bold`}
                      />
                    ) : (
                      <div className="font-bold">{s.name}</div>
                    )}
                    <div className="mt-1 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(editing === s.id ? null : s.id)}
                        className="rounded-lg border border-zinc-300 px-2 py-0.5 text-[12px] font-semibold active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-800"
                      >
                        {editing === s.id ? "완료" : "수정"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`${s.name} 님을 명단에서 뺄까요?
근무표 배정도 같이 지워집니다.`))
                            removeStaff(s.id);
                        }}
                        className="rounded-lg border border-red-300 px-2 py-0.5 text-[12px] font-semibold text-red-600 active:bg-red-50 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/40"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                  <td
                    className={[
                      "px-3 py-2",
                      s.email ? "" : "text-zinc-400",
                    ].join(" ")}
                  >
                    {editing === s.id ? (
                      <input
                        type="email"
                        value={s.email}
                        aria-label={`${s.name} 이메일`}
                        placeholder="a@b.c"
                        onChange={(e) => patchStaff(s.id, { email: e.target.value })}
                        className={`${INPUT} py-1 text-[13px]`}
                      />
                    ) : s.email ? (
                      showContacts ? s.email : maskEmail(s.email)
                    ) : (
                      "없음"
                    )}
                  </td>
                  <td
                    className={[
                      "px-3 py-2 tabular-nums",
                      s.phone ? "" : "text-zinc-400",
                    ].join(" ")}
                  >
                    {editing === s.id ? (
                      <input
                        type="tel"
                        value={s.phone}
                        aria-label={`${s.name} 전화번호`}
                        placeholder="010-0000-0000"
                        onChange={(e) => patchStaff(s.id, { phone: e.target.value })}
                        className={`${INPUT} py-1 text-[13px]`}
                      />
                    ) : s.phone ? (
                      showContacts ? s.phone : maskPhone(s.phone)
                    ) : (
                      "없음"
                    )}
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
                <th scope="col" className="w-12 px-2 py-2.5 text-[11px] font-semibold text-zinc-400">
                  지우기
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStaff.map((s) => (
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
            메일 한 통에 <b>직원 명단(섹션·이름)</b>과 <b>이번 주 근무표</b>가
            들어가고, 이메일이 있는 직원 전원에게 나갑니다. 서버 메일(Resend)이
            설정돼 있으면 <b>여기서 바로, 한 사람에 한 통씩</b> 보냅니다 — 직원
            이메일이 Resend 를 거쳐 나갑니다. 설정이 없으면 메일 앱이 열리고 본문은
            복사해 두니 <b>붙여넣어 직접 보내세요.</b>
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void sendMail()}
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

          {mailState.s === "sending" && (
            <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
              보내는 중… (한 사람에 한 통씩)
            </p>
          )}
          {mailState.s === "sent" && (
            <p
              role="status"
              className={
                mailState.sent.length > 0
                  ? "mt-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[12px] leading-relaxed text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "mt-2 rounded-xl bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300"
              }
            >
              {mailState.sent.length > 0 && <>직원 {mailState.sent.length}명에게 보냈습니다. </>}
              {mailState.failed.length > 0 && (
                <>
                  못 보낸 사람 {mailState.failed.length}명 —{" "}
                  {mailState.failed.map((f) => `${f.to} (${f.reason})`).join(" · ")}
                </>
              )}
            </p>
          )}
          {mailState.s === "error" && (
            <p
              role="alert"
              className="mt-2 rounded-xl bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              보내지 못했습니다 — {mailState.reason}
            </p>
          )}

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
