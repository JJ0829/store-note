"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BTN, Card, Caveat, Chip, Empty, INPUT, Screen, useSaveState } from "@/components/ui";
import { copyText } from "@/lib/copyText";
import { logEvent } from "@/lib/metrics";
import { businessDay, recentDays } from "@/lib/businessDay";
import { ro } from "@/lib/store";
import { label as dayLabel } from "@/lib/roster";
import {
  buildOrderText,
  loadOrderLinks,
  loadOrderLog,
  pendingFrom,
  putState,
  saveOrderLinks,
  saveOrderLog,
  stateOf,
  type OrderLinks,
  type OrderLog,
} from "@/lib/orders";
import {
  arrivalOf,
  cutoffOrder,
  loadVendors,
  minutesToCutoff,
  type VendorData,
} from "@/lib/vendors";
import type { PrepList, PrepTask } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 발주 체크.
 *
 * 화면 순서가 곧 아침 순서다.
 *   1) 주문했는데 안 들어온 것   ← 이걸 모르고 영업을 열면 점심에 터진다
 *   2) 오늘 마감이 임박한 거래처
 *   3) 오늘 주문할 것 (프렙의 발주 항목)
 *
 * 프렙 화면과 달리 여기는 "주문함"과 "들어옴"을 나눠서 받는다.
 * 종이 체크리스트가 못 잡는 게 정확히 그 사이다.
 * ------------------------------------------------------------------ */

/** 발주 항목만 골라낸다. 프렙 전체를 다시 보여주면 프렙 화면과 겹친다 */
function orderTasks(lists: PrepList[]): Array<{ list: PrepList; task: PrepTask }> {
  return lists.flatMap((list) =>
    list.tasks.filter((t) => t.kind === "order").map((task) => ({ list, task })),
  );
}

export default function OrderView({
  storeName,
  prepLists,
}: {
  storeName: string;
  prepLists: PrepList[];
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [vendors, setVendors] = useState<VendorData | null>(null);
  const [log, setLog] = useState<OrderLog>({});
  const [links, setLinks] = useState<OrderLinks>({});
  const save = useSaveState();

  useEffect(() => {
    setNow(new Date());
    setVendors(loadVendors());
    setLog(loadOrderLog());
    setLinks(loadOrderLinks());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const tasks = useMemo(() => orderTasks(prepLists), [prepLists]);
  const taskById = useMemo(
    () => new Map(tasks.map(({ task }) => [task.id, task])),
    [tasks],
  );

  if (!now || !vendors) {
    return (
      <Screen title="발주" storeName={storeName} wide>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  // ★ 달력 날짜가 아니라 영업일이다. 마감조가 23:50 에 "주문함"을 찍고
  //   00:10 에 고치려 하면, 달력 날짜로는 다른 키라 빈 상태를 보게 된다.
  //   체크리스트·프렙과 같은 규칙을 쓴다 (경계 새벽 4시).
  const today = businessDay(now);

  // 지난 7영업일 중 주문만 하고 안 들어온 것
  const past = recentDays(today, 7);
  const pending = pendingFrom(log, past);

  function patch(taskId: string, p: Parameters<typeof putState>[3]) {
    const before = stateOf(log, today, taskId);
    const next = putState(log, today, taskId, p);
    setLog(next);
    /**
     * ★ `ordered`/`received` 가 **꺼져 있다가 켜지는 전이**만 남긴다.
     *
     * 끄는 것은 오조작 정정이 대부분이고, `memo` 입력은 `onChange` 라
     * 글자마다 불린다. 재고 싶은 것은 **"주문 마감을 지키는가"** 와
     * **"주문한 게 들어온 걸 확인하는가"** 둘이다 — 두 단계로 나눠둔
     * 이유가 그것이다.
     *
     * ★ 값이 아니라 전이로 봐야 하는 이유: `들어옴` 을 누르면 `ordered` 도
     *   파생으로 켠다(들어왔으면 주문한 것이다). 그래서 값만 보면 이미
     *   켜져 있던 `ordered` 를 또 남긴다.
     */
    if (p.ordered === true && !before.ordered) {
      logEvent("order_mark", { step: "ordered" });
    }
    if (p.received === true && !before.received) {
      logEvent("order_mark", { step: "received" });
    }
    // ★ "주문함" 이 안 남으면 내일 아침에 안 들어온 것을 못 잡는다.
    //   이 화면의 존재 이유가 바로 그 한 칸이다
    save.report("발주 기록", saveOrderLog(next), () =>
      save.report("발주 기록", saveOrderLog(next)),
    );
  }

  function link(taskId: string, vendorId: string) {
    const next = { ...links, [taskId]: vendorId };
    setLinks(next);
    // ★ 발주 기록과 거래처 연결은 다른 대상이다
    save.report("거래처 연결", saveOrderLinks(next), () =>
      save.report("거래처 연결", saveOrderLinks(next)),
    );
  }

  /* ---------- 거래처별로 모아 발주서를 만든다 ---------- */
  function sendFor(vendorId: string) {
    const v = vendors!.vendors.find((x) => x.id === vendorId);
    if (!v) return;
    const lines = tasks
      .filter(({ task }) => links[task.id] === vendorId)
      .map(({ task }) => ({
        name: task.title,
        memo: stateOf(log, today, task.id).memo,
      }));
    if (lines.length === 0) return;
    const text = buildOrderText(storeName, v.name, lines);
    void copyText(text, "아래 발주 문구를 복사해 보내세요").then((r) => {
      if (r === "copied")
        window.alert(`${v.name} 발주 문구를 복사했습니다. ${ro(v.how)} 보내세요.`);
    });
  }

  const hasVendors = vendors.vendors.length > 0;

  // 오늘 몇 개를 넣었는가. "들어옴" 은 "주문함" 을 포함한다 (들어왔으면 주문한 것이다)
  const orderedCount = tasks.filter(({ task }) => stateOf(log, today, task.id).ordered).length;
  const receivedCount = tasks.filter(({ task }) => stateOf(log, today, task.id).received).length;

  return (
    <Screen
      title="발주"
      storeName={storeName}
      saved={save.saved}
      saveFailed={save.failures}
      wide
    >
      {/* ---------- 1. 안 들어온 것 ---------- */}
      {pending.length > 0 && (
        <section className="mt-5 rounded-2xl border-2 border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <h2 className="text-[15px] font-bold text-red-800 dark:text-red-200">
            주문했는데 아직 안 들어온 것 {pending.length}개
          </h2>
          <p className="mt-1 text-[12px] text-red-700/80 dark:text-red-300/80">
            들어왔으면 눌러서 표시해 주세요. 안 들어왔으면 거래처에 확인이
            필요합니다.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((p) => {
              const t = taskById.get(p.taskId);
              return (
                <li
                  key={`${p.date}-${p.taskId}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      {t?.title ?? p.taskId}
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {p.date} 주문{p.memo ? ` · ${p.memo}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => {
                      const next = putState(log, p.date, p.taskId, { received: true });
                      // 지난 7일 밀린 것을 뒤늦게 확인한 경우. 늦음을 같이 남긴다
                      logEvent("order_mark", { step: "received", late: true });
                      setLog(next);
                      save.report("발주 기록", saveOrderLog(next));
                    }}
                  >
                    들어왔음
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- 2. 마감 임박 ---------- */}
      {hasVendors && (
        <Card
          className="mt-4"
          title="오늘 주문 마감"
          note="마감을 넘기면 그 주문은 다음 배송일로 밀립니다."
        >
          <ul className="mt-2 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {/* ★ 남은 시간 오름차순으로 그냥 정렬하면 **마감이 지난 거래처가
                맨 위**에 선다(지나면 음수라서). 아침에 이 화면을 여는 이유는
                «지금 주문하면 되는 것»을 보려는 것이다 — `cutoffOrder` 참고. */}
            {[...vendors.vendors]
              .sort((a, b) => cutoffOrder(a, b, now))
              .map((v) => {
                const left = minutesToCutoff(v, now);
                const arrive = arrivalOf(v, now);
                const soon = left >= 0 && left <= 60;
                return (
                  <li
                    key={v.id}
                    className={[
                      "flex items-center justify-between gap-3 py-2.5",
                      // 지난 것은 오늘 할 일이 없다. 자리는 두되 눈은 안 끌게
                      left < 0 ? "opacity-55" : "",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">
                        {v.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {v.how}
                        {v.contact ? ` · ${v.contact}` : ""} · 지금 주문하면{" "}
                        {dayLabel(arrive)} 도착
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={[
                          "font-mono text-[13px] tabular-nums",
                          left < 0
                            ? "text-zinc-400"
                            : soon
                              ? "font-bold text-red-600 dark:text-red-400"
                              : "text-zinc-600 dark:text-zinc-300",
                        ].join(" ")}
                      >
                        {left < 0
                          ? "마감"
                          : `${Math.floor(left / 60)}시간 ${left % 60}분`}
                      </span>
                      {v.phone && (
                        <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`} className={BTN}>
                          전화
                        </a>
                      )}
                      <button type="button" className={BTN} onClick={() => sendFor(v.id)}>
                        발주서
                      </button>
                    </span>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}

      {/* ---------- 3. 오늘 주문할 것 ---------- */}
      {/* ★ 제목에 진행을 적는다. 이 화면은 **매일 아침 여는 다섯 중 하나**인데,
          «오늘 것을 다 넣었는가» 를 보려면 카드를 하나씩 눈으로 훑어야 했다.
          프렙·체크리스트는 진작 진행률을 머리에 달고 있다. */}
      <Card
        className="mt-4"
        title={
          tasks.length === 0
            ? "주문할 것"
            : `주문할 것 ${orderedCount}/${tasks.length}` +
              (receivedCount ? ` · 들어옴 ${receivedCount}` : "")
        }
        note="프렙 목록의 발주 항목을 그대로 가져옵니다. 여기서 체크하면 프렙과 따로 관리하지 않아도 됩니다."
      >
        {tasks.length === 0 ? (
          <div className="mt-3">
            <Empty>프렙 목록에 발주 항목이 없습니다.</Empty>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {tasks.map(({ list, task }) => {
              const st = stateOf(log, today, task.id);
              return (
                <li
                  key={task.id}
                  className={[
                    "rounded-xl border-2 p-3",
                    st.received
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                      : st.ordered
                        ? "border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30"
                        : !task.recoverable
                          ? "border-red-300 dark:border-red-900"
                          : "border-zinc-200 dark:border-zinc-800",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold">{task.title}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                        {list.name}
                        {task.leadTimeDays !== null && ` · 주문 후 ${task.leadTimeDays}일`}
                      </span>
                      {!task.recoverable && (
                        <span className="mt-1 block text-[12px] font-semibold text-red-600 dark:text-red-400">
                          까먹지 말고 해야 할 것 — {task.consequence}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 gap-1.5">
                      <Chip on={st.ordered} onClick={() => patch(task.id, { ordered: !st.ordered })}>
                        주문함
                      </Chip>
                      <Chip
                        on={st.received}
                        onClick={() =>
                          patch(task.id, {
                            received: !st.received,
                            // 들어왔으면 주문은 당연히 한 것이다
                            ordered: !st.received ? true : st.ordered,
                          })
                        }
                      >
                        들어옴
                      </Chip>
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={st.memo}
                      onChange={(e) => patch(task.id, { memo: e.target.value })}
                      placeholder="수량 (우유 12팩)"
                      aria-label={`${task.title} 수량`}
                      className={`${INPUT} max-w-[220px]`}
                    />
                    {hasVendors && (
                      <select
                        value={links[task.id] ?? ""}
                        onChange={(e) => link(task.id, e.target.value)}
                        aria-label={`${task.title} 거래처`}
                        className={`${INPUT} max-w-[180px]`}
                      >
                        <option value="">거래처 고르기</option>
                        {vendors.vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!hasVendors && (
        <Caveat>
          거래처를 아직 안 넣었습니다. 넣으면 <b>마감 시각까지 남은 시간</b>과{" "}
          <b>주문하면 언제 오는지</b>가 같이 나오고, 발주 문구도 만들어
          줍니다.{" "}
          <Link href="/vendors" className="underline">
            거래처 넣기
          </Link>
        </Caveat>
      )}
    </Screen>
  );
}
