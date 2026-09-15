"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BTN_PRIMARY, Card, Caveat, Chip, Empty, INPUT, NumField, Screen, useSaveState } from "@/components/ui";
import { won } from "@/lib/store";
import { loadRoster, WEEKDAY, type RosterData, type Staff } from "@/lib/roster";
import { SKIP, hasRows, pullContracts, pushContractSet } from "@/lib/serverSync";
import {
  checkContract,
  contractOf,
  keepUntil,
  loadContracts,
  newContract,
  saveContracts,
  type Contract,
} from "@/lib/contracts";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";

/* ------------------------------------------------------------------ *
 * 근로계약서 관리.
 *
 * ★ 계약서 원본을 보관하지 않는다. 조건과 의무만 추적한다.
 *   이유는 `src/lib/contracts.ts` 맨 위에 적어뒀다 — 원본에는
 *   주민등록번호가 들어가고, 그건 공용 태블릿 저장소에 둘 수 없다.
 *
 * 그래서 이 화면이 답하는 질문은 딱 이것들이다.
 *   - 서면으로 만들어서 **줬는가** (제17조 — 안 주면 벌금)
 *   - 시급이 최저임금 위인가
 *   - 주휴수당이 붙는가 (주 15시간)
 *   - 계약이 언제 끝나고, 언제까지 보관해야 하는가 (제42조 — 3년)
 * ------------------------------------------------------------------ */

export default function ContractView({ storeName }: { storeName: string }) {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [list, setList] = useState<Contract[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const save = useSaveState();

  useEffect(() => {
    setRoster(loadRoster());
    setList(loadContracts());
    setSettings(loadSettings());

    /* ★ 서버에 사본이 있으면 그것으로 덮어쓴다 (2026-09-13).
       근로계약은 근로기준법 제42조로 3년 보존 대상인데 태블릿 안에만 있었다.
       로그인 안 했으면 `null` 이 와서 아무 일도 안 일어난다. */
    /* ★★ 빈 서버로 태블릿을 덮지 않는다 (2026-09-15 · 출퇴근에서 실제로 지워졌다).
       빈 배열도 참이라 `if (!server)` 를 통과한다 → `saveContracts([])` 가 돌고
       **법정 3년 보존 대상인 근로계약이 통째로 사라진다.**
       비어 있으면 반대로 이 태블릿 것을 올린다 — 첫 로그인에 올라가야 한다. */
    void pullContracts().then((server) => {
      if (server === null) return; // 로그인 안 함
      if (hasRows(server)) {
        saveContracts(server);
        setList(server);
        return;
      }
      const mine = loadContracts();
      if (hasRows(mine)) sendUp(mine, loadRoster().staff);
    });
  }, []);

  function commit(next: Contract[]) {
    setList(next);
    // ★ 근로계약은 근로기준법 제42조로 3년 보존 대상이다. 조용히 잃으면 안 된다
    save.report("계약 내용", saveContracts(next), () =>
      save.report("계약 내용", saveContracts(next)),
    );
    sendUp(next);
  }

  /* ★ 서버 보관은 **따로 알린다.** 태블릿에는 남았는데 서버에 못 간 경우를
     구분하지 못하면, 기기를 바꾼 날에야 없다는 걸 알게 된다. */
  /* ★ `staffList` — 첫 로그인에 올릴 때는 `roster` 상태가 아직 안 채워져 있다
     (같은 effect 안에서 부른다). 그때는 방금 읽은 것을 넘긴다. */
  function sendUp(next: Contract[], staffList?: Staff[]) {
    const staff = staffList ?? roster?.staff;
    if (!staff) return;
    void pushContractSet(staff, next).then((r) => {
      if (!r.ok && r.reason === SKIP) return;
      save.report("계약 내용(서버 보관)", r.ok, () => sendUp(next, staff));
    });
  }

  function patchSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    // ★ 계약과 설정은 다른 대상이다. 하나로 묶으면 엉뚱한 것을 다시 저장한다
    save.report("사업장 설정", saveSettings(next), () =>
      save.report("사업장 설정", saveSettings(next)),
    );
  }

  if (!roster || !settings) {
    return (
      <Screen title="근로계약서" storeName={storeName} wide>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  function patch(id: string, p: Partial<Contract>) {
    commit(list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  function addFor(staffId: string) {
    const c = newContract(staffId);
    commit([...list, c]);
    setOpen(c.id);
  }

  const missing = roster.staff.filter((s) => !contractOf(list, s.id));

  return (
    <Screen
      title="근로계약서"
      storeName={storeName}
      saved={save.saved}
      saveFailed={save.failures}
      wide
    >
      {/* ---------- 사업장 설정 ---------- */}
      <Card
        className="mt-5"
        title="사업장 설정"
        note="이 두 값이 경고와 인건비 계산을 좌우합니다."
      >
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
              최저임금 시급
            </span>
            <div className="mt-1 w-36">
              <NumField
                label="최저임금 시급"
                value={settings.minWage}
                onChange={(v) => patchSettings({ minWage: v })}
                suffix="원"
              />
            </div>
            <span className="mt-1 block text-[11px] text-zinc-400">
              2026년 적용액 10,320원
            </span>
          </label>

          <div>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
              상시 근로자
            </span>
            <div className="mt-1 flex gap-2">
              <Chip on={!settings.fiveOrMore} onClick={() => patchSettings({ fiveOrMore: false })}>
                5인 미만
              </Chip>
              <Chip on={settings.fiveOrMore} onClick={() => patchSettings({ fiveOrMore: true })}>
                5인 이상
              </Chip>
            </div>
            <span className="mt-1 block text-[11px] text-zinc-400">
              5인 미만은 연장 가산수당이 없습니다 (근로기준법 제11조)
            </span>
          </div>
        </div>
      </Card>

      {roster.staff.length === 0 && (
        <div className="mt-4">
          <Empty>
            직원이 없습니다. 근무표에서 직원을 먼저 넣어 주세요.
          </Empty>
          <Link href="/roster" className={`${BTN_PRIMARY} mt-3 block text-center`}>
            근무표로 가기
          </Link>
        </div>
      )}

      {/* ---------- 계약서 없는 직원 ---------- */}
      {missing.length > 0 && (
        <section className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <h2 className="text-[15px] font-bold text-red-800 dark:text-red-200">
            계약 정보가 없는 직원 {missing.length}명
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-red-700/80 dark:text-red-300/80">
            근로계약서는 일을 시작하기 전에 서면으로 만들어 <b>한 부를 줘야</b>{" "}
            합니다. 안 주면 500만원 이하 벌금입니다 (근로기준법 제17조).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => addFor(s.id)}
                className="rounded-lg border-2 border-dashed border-red-400 bg-white px-3 py-1.5 text-[13px] font-semibold text-red-700 dark:bg-zinc-900 dark:text-red-300"
              >
                + {s.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- 계약 목록 ---------- */}
      <div className="mt-4 flex flex-col gap-3">
        {roster.staff.map((s) => {
          const c = contractOf(list, s.id);
          if (!c) return null;
          const checks = checkContract(c, settings.minWage);
          const danger = checks.filter((x) => x.level === "danger");
          const keep = keepUntil(c);
          const isOpen = open === c.id;

          return (
            <Card key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : c.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold">
                    {s.name}
                    <span className="ml-2 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                      {s.section}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                    {c.hourlyWage > 0 ? `${won(c.hourlyWage)}원/시` : "시급 미입력"}
                    {c.weeklyHours > 0 && ` · 주 ${c.weeklyHours}시간`}
                    {c.startDate && ` · ${c.startDate}부터`}
                    {c.endDate ? ` ~ ${c.endDate}` : c.startDate ? " (기간 없음)" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {danger.length > 0 ? (
                    <span className="rounded-lg bg-red-100 px-2.5 py-1 text-[12px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                      확인 {danger.length}건
                    </span>
                  ) : (
                    <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[12px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      이상 없음
                    </span>
                  )}
                </span>
              </button>

              {/* 점검 결과 */}
              {checks.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {checks.map((k, i) => (
                    <li
                      key={i}
                      className={[
                        "rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                        k.level === "danger"
                          ? "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200"
                          : k.level === "warn"
                            ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                      ].join(" ")}
                    >
                      <b>{k.title}</b>
                      <span className="mt-0.5 block opacity-80">{k.basis}</span>
                    </li>
                  ))}
                </ul>
              )}

              {isOpen && (
                <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        계약 시작일
                      </span>
                      <input
                        type="date"
                        value={c.startDate}
                        onChange={(e) => patch(c.id, { startDate: e.target.value })}
                        aria-label="계약 시작일"
                        className={INPUT}
                      />
                    </label>
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        계약 종료일 (없으면 비움)
                      </span>
                      <input
                        type="date"
                        value={c.endDate}
                        onChange={(e) => patch(c.id, { endDate: e.target.value })}
                        aria-label="계약 종료일"
                        className={INPUT}
                      />
                    </label>
                    <div>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        시급
                      </span>
                      <NumField
                        label="시급"
                        value={c.hourlyWage}
                        onChange={(v) => patch(c.id, { hourlyWage: v })}
                        placeholder="10320"
                        suffix="원"
                      />
                    </div>
                    <div>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        1주 소정근로시간
                      </span>
                      <NumField
                        label="1주 소정근로시간"
                        value={c.weeklyHours}
                        onChange={(v) => patch(c.id, { weeklyHours: v })}
                        placeholder="20"
                        suffix="시간"
                      />
                    </div>
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        근로시간 시작
                      </span>
                      <input
                        value={c.startTime}
                        onChange={(e) => patch(c.id, { startTime: e.target.value })}
                        placeholder="09:00"
                        aria-label="근로시간 시작"
                        className={`${INPUT} font-mono`}
                      />
                    </label>
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        근로시간 종료
                      </span>
                      <input
                        value={c.endTime}
                        onChange={(e) => patch(c.id, { endTime: e.target.value })}
                        placeholder="14:00"
                        aria-label="근로시간 종료"
                        className={`${INPUT} font-mono`}
                      />
                    </label>
                  </div>

                  <p className="mt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                    근무 요일
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {WEEKDAY.map((w, i) => (
                      <Chip
                        key={w}
                        on={c.workDays.includes(i)}
                        onClick={() =>
                          patch(c.id, {
                            workDays: c.workDays.includes(i)
                              ? c.workDays.filter((d) => d !== i)
                              : [...c.workDays, i].sort(),
                          })
                        }
                      >
                        {w}
                      </Chip>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <label className="flex items-start gap-2.5 rounded-xl border-2 border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                      <input
                        type="checkbox"
                        checked={c.handedOver}
                        onChange={(e) => patch(c.id, { handedOver: e.target.checked })}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-orange-500"
                      />
                      <span className="text-[13px] leading-relaxed">
                        <b>서면으로 만들어 한 부를 줬습니다</b>
                        <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                          만들기만 하고 안 주면 위반입니다 (근로기준법 제17조)
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 rounded-xl border-2 border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                      <input
                        type="checkbox"
                        checked={c.insured}
                        onChange={(e) => patch(c.id, { insured: e.target.checked })}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-orange-500"
                      />
                      <span className="text-[13px]">4대보험에 가입했습니다</span>
                    </label>
                  </div>

                  <label className="mt-3 block">
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      메모 (수습 기간, 담당 업무 등)
                    </span>
                    <input
                      value={c.note}
                      onChange={(e) => patch(c.id, { note: e.target.value })}
                      aria-label="메모"
                      className={INPUT}
                    />
                  </label>

                  {keep && (
                    <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2.5 text-[12px] leading-relaxed text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      원본 계약서는 <b>{keep.getFullYear()}년 {keep.getMonth() + 1}월{" "}
                      {keep.getDate()}일</b>까지 보관해야 합니다 (근로기준법
                      제42조 · 3년).
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`${s.name}의 계약 정보를 지웁니다.`)) return;
                      commit(list.filter((x) => x.id !== c.id));
                    }}
                    className="mt-4 w-full rounded-xl border-2 border-red-200 py-2.5 text-[13px] font-semibold text-red-600 dark:border-red-900 dark:text-red-400"
                  >
                    이 계약 정보 지우기
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Caveat>
        이 화면은 <b>계약서 원본을 보관하지 않습니다.</b> 원본에는
        주민등록번호가 들어가는데, 개인정보보호법 제24조의2는 그걸 법령
        근거가 있을 때만, 그것도 암호화해서 두도록 하고 있습니다. 지금처럼
        태블릿 브라우저에 저장하는 구조로는 그 요건을 맞출 수 없어서{" "}
        <b>주민등록번호 칸을 아예 만들지 않았습니다.</b> 원본은 종이나 잠긴
        폴더에 두시고, 여기서는 조건과 기한만 보세요.
      </Caveat>
    </Screen>
  );
}
