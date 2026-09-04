"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Caveat, Empty, NumField, Row, Screen } from "@/components/ui";
import { pct, won } from "@/lib/store";
import { costOfRecipe, costRate, suggestedPrice } from "@/lib/cost";
import { loadVendors } from "@/lib/vendors";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { loadLocalRecipes } from "@/lib/localRecipes";
import type { Recipe } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 원가.
 *
 * 새 데이터를 거의 안 만든다. 레시피의 재료 수량 × 거래처 단가다.
 * 배수 계산 때문에 넣어둔 `amount`가 그대로 원가의 재료가 됐다.
 *
 * ★ 화면에서 가장 중요한 것은 숫자가 아니라 **"몇 개를 못 구했다"**다.
 *   재료 여섯 중 둘의 단가가 없는데 원가율 11%라고 뜨면 사장님은 그걸
 *   믿고 가격을 정한다. 그래서 못 구한 게 있으면 원가율을 회색으로
 *   낮추고 경고를 붙인다.
 * ------------------------------------------------------------------ */

export default function CostView({
  storeName,
  seedRecipes,
}: {
  storeName: string;
  seedRecipes: Recipe[];
}) {
  const [items, setItems] = useState<ReturnType<typeof loadVendors> | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [local, setLocal] = useState<Recipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setItems(loadVendors());
    setSettings(loadSettings());
    setLocal(loadLocalRecipes());
  }, []);

  const recipes = useMemo(() => [...seedRecipes, ...local], [seedRecipes, local]);

  const rows = useMemo(() => {
    if (!items || !settings) return [];
    return recipes.map((r) => {
      const cost = costOfRecipe(r, items.items, settings.excluded);
      const price = settings.prices[r.id] ?? 0;
      return { recipe: r, cost, price, rate: costRate(cost.perUnit, price) };
    });
  }, [recipes, items, settings]);

  function setPrice(id: string, price: number) {
    if (!settings) return;
    const next = { ...settings, prices: { ...settings.prices, [id]: price } };
    setSettings(next);
    saveSettings(next);
  }

  function setTarget(v: number) {
    if (!settings) return;
    const next = { ...settings, targetCostRate: v };
    setSettings(next);
    saveSettings(next);
  }

  if (!items || !settings) {
    return (
      <Screen title="원가" storeName={storeName}>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  if (items.items.length === 0) {
    return (
      <Screen title="원가" storeName={storeName}>
        <div className="mt-5">
          <Empty>
            거래처에 <b>품목 단가</b>가 아직 없습니다.
            <br />
            원가는 레시피 재료 × 단가로 계산되므로 단가가 먼저 필요합니다.
          </Empty>
          <Link
            href="/vendors"
            className="mt-3 flex items-center justify-between rounded-2xl bg-orange-500 px-4 py-3.5 text-[15px] font-bold text-white active:bg-orange-600"
          >
            거래처에서 단가 넣기
            <span aria-hidden>›</span>
          </Link>
        </div>
      </Screen>
    );
  }

  const totalMissing = rows.reduce((s, r) => s + r.cost.missing, 0);

  return (
    <Screen title="원가" storeName={storeName} wide>
      {/* ---------- 목표 원가율 ---------- */}
      <Card
        className="mt-5"
        title="목표 원가율"
        note="카페는 보통 30% 안쪽을 봅니다. 이 값으로 '얼마에 팔면 되는지'를 거꾸로 계산합니다."
      >
        <div className="mt-2 w-32">
          <NumField
            label="목표 원가율"
            value={settings.targetCostRate}
            onChange={setTarget}
            suffix="%"
          />
        </div>
      </Card>

      {totalMissing > 0 && (
        <Caveat>
          단가를 못 찾은 재료가 <b>{totalMissing}개</b> 있습니다. 그 재료는
          0원으로 세지 않고 빼놨기 때문에, 아래 원가와 원가율은{" "}
          <b>실제보다 낮습니다.</b>{" "}
          <Link href="/vendors" className="underline">
            거래처에서 채우기
          </Link>
        </Caveat>
      )}

      {/* ---------- 메뉴별 ---------- */}
      <div className="mt-4 flex flex-col gap-3">
        {rows.map(({ recipe, cost, price, rate }) => {
          const open = openId === recipe.id;
          const shaky = cost.missing > 0;
          const suggest = suggestedPrice(cost.perUnit, settings.targetCostRate);
          return (
            <Card key={recipe.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : recipe.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-bold">
                    {recipe.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                    1배합 {recipe.yield.amount}
                    {recipe.yield.unit} · 재료 {recipe.ingredients.length}개
                    {shaky && (
                      <>
                        {" · "}
                        <b className="text-amber-600 dark:text-amber-400">
                          단가 없음 {cost.missing}개
                        </b>
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[17px] font-bold tabular-nums">
                    {won(cost.perUnit)}원
                  </span>
                  <span
                    className={[
                      "block text-[12px]",
                      rate === null
                        ? "text-zinc-400"
                        : shaky
                          ? "text-zinc-400"
                          : rate > settings.targetCostRate
                            ? "font-bold text-red-600 dark:text-red-400"
                            : "font-bold text-emerald-600 dark:text-emerald-400",
                    ].join(" ")}
                  >
                    {rate === null
                      ? "판매가 입력"
                      : `원가율 ${pct(cost.perUnit, price)}%`}
                  </span>
                </span>
              </button>

              {/* 판매가 */}
              <div className="mt-3 flex items-center gap-2">
                <span className="shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                  판매가
                </span>
                <div className="w-36">
                  <NumField
                    label={`${recipe.name} 판매가`}
                    value={price}
                    onChange={(v) => setPrice(recipe.id, v)}
                    placeholder="4500"
                    suffix="원"
                  />
                </div>
                {suggest !== null && (
                  <button
                    type="button"
                    onClick={() => setPrice(recipe.id, suggest)}
                    className="shrink-0 rounded-lg border-2 border-zinc-300 px-2.5 py-2 text-[12px] font-semibold dark:border-zinc-700"
                  >
                    {settings.targetCostRate}%로 맞추면 {won(suggest)}원
                  </button>
                )}
              </div>

              {open && (
                <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  {cost.lines.map((l, i) => (
                    <div key={`${l.name}-${i}`}>
                      <Row
                        label={
                          <span className={l.excluded ? "text-zinc-400" : ""}>
                            {l.name}
                            <span className="ml-1.5 text-zinc-400">
                              {l.amount}
                              {l.unit}
                            </span>
                            {l.excluded && (
                              <span className="ml-1.5 text-[11px]">안 셈</span>
                            )}
                          </span>
                        }
                        value={l.cost === null ? "—" : `${won(l.cost)}원`}
                        danger={l.cost === null}
                      />
                      {l.problem && (
                        <p className="pb-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          {l.problem}
                        </p>
                      )}
                    </div>
                  ))}

                  <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <Row
                      label={`1배합 (${recipe.yield.amount}${recipe.yield.unit})`}
                      value={`${won(cost.total)}원`}
                    />
                    <Row
                      label={`1${recipe.yield.unit}당 재료비`}
                      value={`${won(cost.perUnit)}원`}
                      strong
                    />
                    {price > 0 && (
                      <Row
                        label={`1${recipe.yield.unit} 팔면 남는 것 (재료비만 뺀 값)`}
                        value={`${won(price - cost.perUnit)}원`}
                      />
                    )}
                  </div>

                  <Link
                    href={`/r/${recipe.slug}`}
                    className="mt-3 inline-block text-[13px] font-semibold text-orange-600 underline dark:text-orange-400"
                  >
                    레시피 보기 ›
                  </Link>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Caveat>
        여기 원가는 <b>재료비만</b>입니다. 인건비·임대료·공과금·카드수수료·
        로스(버리는 양)가 들어 있지 않습니다. 실제로 남는 돈은{" "}
        <Link href="/sales" className="underline">
          매출 화면
        </Link>
        에서 인건비까지 빼고 봅니다.
      </Caveat>
    </Screen>
  );
}
