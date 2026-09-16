"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  BTN,
  BTN_PRIMARY,
  Card,
  Chip,
  Empty,
  INPUT,
  NumField,
  Screen,
  useSaveState,
} from "@/components/ui";
import { eul, gwa, won } from "@/lib/store";
import { COMMON_UNITS } from "@/lib/units";
import {
  HOW_OPTIONS,
  loadVendors,
  newVendor,
  newVendorItem,
  saveVendors,
  unitPrice,
  type Vendor,
  type VendorData,
  type VendorItem,
} from "@/lib/vendors";
import { WEEKDAY } from "@/lib/roster";
import { SKIP, hasRows, pullVendors, pushVendors } from "@/lib/serverSync";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";

/* ------------------------------------------------------------------ *
 * 거래처와 품목 단가.
 *
 * 이 화면 자체는 재미가 없다. 그런데 여기를 채우지 않으면
 * 원가 화면이 전부 "단가가 없습니다"로만 나온다. 그래서 화면 맨 위에
 * **레시피에는 있는데 단가가 없는 재료**를 먼저 띄운다.
 * 사장님이 뭘 채워야 하는지 스스로 찾게 만들면 안 채운다.
 * ------------------------------------------------------------------ */

export default function VendorView({
  storeName,
  ingredientNames,
}: {
  storeName: string;
  /** 시드 레시피에 나오는 재료 이름들. 단가 붙일 대상이다 */
  ingredientNames: string[];
}) {
  const [data, setData] = useState<VendorData | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const save = useSaveState();
  const [settings, setSettings] = useState<Settings | null>(null);

  const upTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (upTimer.current) clearTimeout(upTimer.current); }, []);

  useEffect(() => {
    setData(loadVendors());
    setSettings(loadSettings());

    /* ★★ 빈 서버로 태블릿을 덮지 않는다 (계약·출퇴근과 같은 규율).
       거래처가 비면 원가율이 통째로 사라지고, 그건 사장님이 가격을 정할 때
       보는 유일한 숫자다. 서버가 비어 있으면 반대로 이 태블릿 것을 올린다. */
    void pullVendors().then((server) => {
      if (server === null) return; // 로그인 안 함
      if (hasRows(server.vendors) || hasRows(server.items)) {
        saveVendors(server);
        setData(server);
        return;
      }
      const mine = loadVendors();
      if (hasRows(mine.vendors) || hasRows(mine.items)) sendUp(mine);
    });
  }, []);

  /** 원가에 세지 않을 재료로 옮긴다 (수돗물, "추출량" 같은 결과값) */
  function toggleExcluded(name: string) {
    if (!settings) return;
    const key = name.trim();
    const has = settings.excluded.some((n) => n.trim() === key);
    const next = {
      ...settings,
      excluded: has
        ? settings.excluded.filter((n) => n.trim() !== key)
        : [...settings.excluded, key],
    };
    setSettings(next);
    // ★ 거래처와 "원가에서 뺄 재료"(설정)는 다른 대상이다
    save.report("원가에서 뺄 재료", saveSettings(next), () =>
      save.report("원가에서 뺄 재료", saveSettings(next)),
    );
  }

  function commit(next: VendorData) {
    setData(next);
    // ★ 단가가 안 남으면 원가율이 다음에 열 때 딴 값이 된다
    save.report("거래처·단가", saveVendors(next), () =>
      save.report("거래처·단가", saveVendors(next)),
    );
    sendUp(next);
  }

  /* ★ 서버 보관은 따로 알린다. 그리고 **글자마다 보내지 않는다** —
     단가를 치는 동안 PUT 이 여러 번 나가면 먼저 것이 나중에 도착해서
     옛 값이 남는다 (2026-09-16 에 계약 화면에서 실제로 그랬다). */
  function sendUp(next: VendorData) {
    if (upTimer.current) clearTimeout(upTimer.current);
    upTimer.current = setTimeout(() => {
      void pushVendors(next).then((r) => {
        if (!r.ok && r.reason === SKIP) return;
        save.report("거래처·단가(서버 보관)", r.ok, () => sendUp(next));
      });
    }, 1200);
  }

  const priced = useMemo(
    () => new Set((data?.items ?? []).map((i) => i.name.trim())),
    [data],
  );
  const skipped = useMemo(
    () => new Set((settings?.excluded ?? []).map((n) => n.trim())),
    [settings],
  );
  const unpriced = ingredientNames.filter(
    (n) => !priced.has(n.trim()) && !skipped.has(n.trim()),
  );

  if (!data || !settings) {
    return (
      <Screen title="거래처" storeName={storeName} wide>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  function addVendor() {
    const v = newVendor();
    v.name = "새 거래처";
    commit({ ...data!, vendors: [...data!.vendors, v] });
    setOpen(v.id);
  }

  function patchVendor(id: string, patch: Partial<Vendor>) {
    commit({
      ...data!,
      vendors: data!.vendors.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    });
  }

  function removeVendor(id: string) {
    const v = data!.vendors.find((x) => x.id === id);
    const mine = data!.items.filter((i) => i.vendorId === id).length;
    const msg = mine
      ? `${gwa(v?.name ?? "")} 등록된 품목 ${mine}개를 지웁니다. 그 품목을 쓰는 레시피는 원가가 다시 빈칸이 됩니다.`
      : `${eul(v?.name ?? "")} 지웁니다.`;
    if (!window.confirm(msg)) return;
    commit({
      vendors: data!.vendors.filter((x) => x.id !== id),
      items: data!.items.filter((i) => i.vendorId !== id),
    });
  }

  function addItem(vendorId: string, name = "") {
    const it = newVendorItem(vendorId);
    it.name = name;
    commit({ ...data!, items: [...data!.items, it] });
    setOpen(vendorId);
  }

  function patchItem(id: string, patch: Partial<VendorItem>) {
    commit({
      ...data!,
      items: data!.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  }

  function removeItem(id: string) {
    commit({ ...data!, items: data!.items.filter((i) => i.id !== id) });
  }

  return (
    <Screen
      title="거래처"
      storeName={storeName}
      saved={save.saved}
      saveFailed={save.failures}
      wide
    >
      {/* ---------- 단가가 빠진 재료 ---------- */}
      {ingredientNames.length > 0 && (
        <Card
          className="mt-5"
          title={
            unpriced.length === 0
              ? "레시피 재료 단가가 모두 들어왔습니다"
              : `단가가 없는 재료 ${unpriced.length}개`
          }
          note={
            unpriced.length === 0
              ? "원가 화면에서 메뉴별 원가율을 볼 수 있습니다."
              : "이게 남아 있으면 원가가 실제보다 낮게 나옵니다. 눌러서 바로 등록하세요."
          }
        >
          {unpriced.length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
              {unpriced.map((n) => (
                <li key={n} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-[14px] font-semibold">{n}</span>
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const target = data.vendors[0] ?? null;
                        if (!target) {
                          window.alert("거래처를 먼저 하나 추가해 주세요.");
                          return;
                        }
                        addItem(target.id, n);
                      }}
                      className="rounded-lg border-2 border-dashed border-orange-400 px-3 py-1.5 text-[12px] font-semibold text-orange-700 dark:text-orange-300"
                    >
                      단가 넣기
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExcluded(n)}
                      className="rounded-lg border-2 border-zinc-300 px-3 py-1.5 text-[12px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                    >
                      안 셈
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* 제외한 재료 — 되돌릴 수 있어야 한다 */}
          {settings.excluded.length > 0 && (
            <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                원가에 안 세는 재료 — 수돗물처럼 값이 없는 것, 그리고
                <b> 아메리카노의 &apos;추출량&apos;처럼 사는 게 아니라 결과인 것</b>.
                여기에 단가를 붙이면 원두 값이 두 번 계산됩니다.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {settings.excluded.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleExcluded(n)}
                    className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {n} ×
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ---------- 거래처 목록 ---------- */}
      <div className="mt-4 flex flex-col gap-3">
        {data.vendors.length === 0 && (
          <Empty>
            거래처가 없습니다.
            <br />
            우유·원두·부자재는 보통 거래처가 따로입니다. 자주 쓰는 곳부터
            하나 추가해 보세요.
          </Empty>
        )}

        {data.vendors.map((v) => {
          const items = data.items.filter((i) => i.vendorId === v.id);
          const isOpen = open === v.id;
          return (
            <Card key={v.id}>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : v.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[16px] font-bold">
                    {v.name || "(이름 없음)"}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                    {v.how} · 마감 {v.cutoff} · 주문 후 {v.leadDays}일 · 품목{" "}
                    {items.length}개
                  </span>
                </button>
                {v.phone && (
                  <a
                    href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}
                    className={BTN}
                    aria-label={`${v.name}에 전화`}
                  >
                    전화
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : v.id)}
                  aria-label={isOpen ? "접기" : "펼치기"}
                  className="shrink-0 px-1 text-lg text-zinc-400"
                >
                  {isOpen ? "⌃" : "⌄"}
                </button>
              </div>

              {isOpen && (
                <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  {/* 기본 정보 */}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2">
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        거래처 이름
                      </span>
                      <input
                        value={v.name}
                        onChange={(e) => patchVendor(v.id, { name: e.target.value })}
                        className={INPUT}
                        aria-label="거래처 이름"
                      />
                    </label>
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        전화번호
                      </span>
                      <input
                        value={v.phone}
                        onChange={(e) => patchVendor(v.id, { phone: e.target.value })}
                        inputMode="tel"
                        className={INPUT}
                        aria-label="전화번호"
                      />
                    </label>
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        담당자
                      </span>
                      <input
                        value={v.contact}
                        onChange={(e) => patchVendor(v.id, { contact: e.target.value })}
                        className={INPUT}
                        aria-label="담당자"
                      />
                    </label>
                    <label>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        주문 마감 시각
                      </span>
                      <input
                        value={v.cutoff}
                        onChange={(e) => patchVendor(v.id, { cutoff: e.target.value })}
                        placeholder="15:00"
                        className={INPUT}
                        aria-label="주문 마감 시각"
                      />
                    </label>
                    <div>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        주문 후 며칠
                      </span>
                      <NumField
                        label="리드타임(일)"
                        value={v.leadDays}
                        onChange={(n) => patchVendor(v.id, { leadDays: n })}
                        suffix="일"
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                    주문 방법
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {HOW_OPTIONS.map((h) => (
                      <Chip
                        key={h}
                        on={v.how === h}
                        onClick={() => patchVendor(v.id, { how: h })}
                      >
                        {h}
                      </Chip>
                    ))}
                  </div>

                  <p className="mt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                    배송하는 요일 — 여기서 뺀 요일은 다음 배송일로 밀려서
                    계산됩니다
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {WEEKDAY.map((w, i) => (
                      <Chip
                        key={w}
                        on={v.deliverDays.includes(i)}
                        onClick={() =>
                          patchVendor(v.id, {
                            deliverDays: v.deliverDays.includes(i)
                              ? v.deliverDays.filter((d) => d !== i)
                              : [...v.deliverDays, i].sort(),
                          })
                        }
                      >
                        {w}
                      </Chip>
                    ))}
                  </div>

                  <label className="mt-3 block">
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      메모
                    </span>
                    <input
                      value={v.note}
                      onChange={(e) => patchVendor(v.id, { note: e.target.value })}
                      placeholder="최소 주문금액, 계좌 등"
                      className={INPUT}
                      aria-label="메모"
                    />
                  </label>

                  {/* ---------- 품목 ---------- */}
                  <h3 className="mt-5 text-[14px] font-bold">
                    품목과 단가
                    <span className="ml-2 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                      이름이 레시피 재료명과 같아야 원가가 붙습니다
                    </span>
                  </h3>

                  <div className="mt-2 flex flex-col gap-2">
                    {items.map((it) => {
                      const per = unitPrice(it, it.packUnit);
                      return (
                        <div
                          key={it.id}
                          className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                        >
                          <div className="flex gap-2">
                            <input
                              value={it.name}
                              onChange={(e) => patchItem(it.id, { name: e.target.value })}
                              placeholder="품목 이름"
                              list="ingredient-names"
                              aria-label="품목 이름"
                              className={INPUT}
                            />
                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              aria-label={`${it.name || "품목"} 지우기`}
                              className="shrink-0 rounded-xl border-2 border-zinc-300 px-3 text-[13px] font-semibold text-red-600 dark:border-zinc-700 dark:text-red-400"
                            >
                              삭제
                            </button>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <NumField
                              label="구매 수량"
                              value={it.packAmount}
                              onChange={(n) => patchItem(it.id, { packAmount: n })}
                              placeholder="1000"
                              className="w-28"
                            />
                            <input
                              value={it.packUnit}
                              onChange={(e) => patchItem(it.id, { packUnit: e.target.value })}
                              list="common-units"
                              aria-label="단위"
                              className={`${INPUT} w-20`}
                            />
                            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                              당
                            </span>
                            <NumField
                              label="가격"
                              value={it.packPrice}
                              onChange={(n) => patchItem(it.id, { packPrice: n })}
                              placeholder="28000"
                              suffix="원"
                              className="w-36"
                            />
                          </div>

                          {per !== null && it.packAmount > 0 && (
                            <p className="mt-2 font-mono text-[12px] text-zinc-500 dark:text-zinc-400">
                              {it.packUnit} 1당{" "}
                              <b className="text-zinc-800 dark:text-zinc-100">
                                {(it.packPrice / it.packAmount).toFixed(2)}원
                              </b>
                              {" · "}
                              {won(it.packPrice)}원 / {it.packAmount}
                              {it.packUnit}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => addItem(v.id)}
                      className="rounded-xl border-2 border-dashed border-zinc-300 py-2.5 text-[13px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      + 품목 추가
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeVendor(v.id)}
                    className="mt-5 w-full rounded-xl border-2 border-red-200 py-2.5 text-[13px] font-semibold text-red-600 dark:border-red-900 dark:text-red-400"
                  >
                    이 거래처 지우기
                  </button>
                </div>
              )}
            </Card>
          );
        })}

        <button type="button" onClick={addVendor} className={BTN_PRIMARY}>
          + 거래처 추가
        </button>
      </div>

      {/* 입력 도움말 — 레시피 재료명을 그대로 고를 수 있게 */}
      <datalist id="ingredient-names">
        {ingredientNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="common-units">
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </Screen>
  );
}
