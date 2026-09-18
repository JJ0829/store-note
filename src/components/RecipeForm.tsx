"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { addLocalRecipe, newLocalId } from "@/lib/localRecipes";
import { newUuid } from "@/lib/store";
import { loadVendors } from "@/lib/vendors";
import { pushRecipes } from "@/lib/serverSync";
import type { Ingredient, Recipe } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 레시피 추가.
 *
 * 주방에서 서서 입력한다는 전제로 만든다. 입력칸을 크게, 필수는 최소로.
 * 재료 이름/양/단위만 채워도 저장된다 — 만드는 순서는 나중에 채워도 된다.
 * (완벽하게 채우라고 하면 아무도 안 채운다)
 * ------------------------------------------------------------------ */

type IngRow = { name: string; amount: string; unit: string; note: string };
type StepRow = { title: string; desc: string };

const EMPTY_ING: IngRow = { name: "", amount: "", unit: "g", note: "" };
const EMPTY_STEP: StepRow = { title: "", desc: "" };

const UNITS = ["g", "ml", "개", "잔", "스쿱", "장"];

const inputBase =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-3 text-[16px] outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900";

export default function RecipeForm({ categories }: { categories: string[] }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "음료");
  const [yieldAmount, setYieldAmount] = useState("1");
  const [yieldUnit, setYieldUnit] = useState("개");
  const [forNewbie, setForNewbie] = useState(false);
  const [ings, setIngs] = useState<IngRow[]>([{ ...EMPTY_ING }]);
  const [steps, setSteps] = useState<StepRow[]>([{ ...EMPTY_STEP }]);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    name.trim().length > 0 &&
    ings.some((i) => i.name.trim() && i.amount.trim());

  function updateIng(i: number, patch: Partial<IngRow>) {
    setIngs((prev) => prev.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  }
  function updateStep(i: number, patch: Partial<StepRow>) {
    setSteps((prev) => prev.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  }

  function save() {
    setError(null);

    const ingredients: Ingredient[] = ings
      .filter((i) => i.name.trim() && i.amount.trim())
      .map((i) => ({
        name: i.name.trim(),
        amount: Number(i.amount) || 0,
        unit: i.unit.trim() || "g",
        note: i.note.trim() || null,
      }));

    if (ingredients.length === 0) {
      setError("재료를 하나 이상 넣어주세요. 양이 있어야 배수 계산이 됩니다.");
      return;
    }

    const id = newLocalId();
    const filledSteps = steps.filter((s) => s.title.trim());

    const recipe: Recipe = {
      id,
      slug: id,
      name: name.trim(),
      category: category.trim() || "기타",
      yield: { amount: Number(yieldAmount) || 1, unit: yieldUnit.trim() || "개" },
      forNewbie,
      ingredients,
      sections:
        filledSteps.length > 0
          ? [
              {
                /* ★ 섹션·스텝 id 도 uuid 다 (2026-09-18). 전에는
                   `my-a1b2c3d4-sec` 이라 서버가 거절했다 — 그리고 아무
                   오류도 안 뜬다. `localRecipes.newLocalId` 주석 참고. */
                id: newUuid(),
                title: "만드는 순서",
                note: null,
                steps: filledSteps.map((s) => ({
                  id: newUuid(),
                  title: s.title.trim(),
                  desc: s.desc.trim(),
                  tip: null,
                  critical: false,
                  goodImage: null,
                  badImage: null,
                  videoUrl: null,
                })),
              },
            ]
          : [],
    };

    if (!addLocalRecipe(recipe)) {
      setError("저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요.");
      return;
    }
    /* ★ 서버에도 남긴다 (2026-09-18). **기다리지 않는다** — 이 화면의 일은
       태블릿에 저장하는 것까지이고, 서버는 «사라지지 않는 사본» 이다.
       로그인 안 했으면 아무 일도 안 일어난다. 실패해도 화면을 막지 않는다:
       막으면 기록은 남았는데 못 나가는 상태가 된다. */
    void pushRecipes([recipe], loadVendors().items);
    router.push(`/r/my?id=${id}`);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] bg-zinc-50 px-4 py-6 pb-32 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <BackButton fallback="/r" />
        <h1 className="text-xl font-bold">레시피 추가</h1>
      </div>

      {/* ---------- 기본 ---------- */}
      <section className="mt-5">
        <label className="block text-[13px] font-bold" htmlFor="rf-name">
          메뉴 이름 <span className="text-orange-600">*</span>
        </label>
        <input
          id="rf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 바닐라라떼"
          className={`mt-1.5 ${inputBase}`}
        />

        <div className="mt-4">
          <span className="block text-[13px] font-bold">분류</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[...new Set([...categories, "브런치", "기타"])].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={[
                  "rounded-xl border-2 px-3.5 py-2.5 text-[14px] font-semibold",
                  category === c
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="block text-[13px] font-bold">
            1배합에 몇 개 나오나요?
          </span>
          <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
            이 값이 있어야 &ldquo;9개 필요하면 1.5배&rdquo;가 계산됩니다.
          </p>
          <div className="mt-1.5 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={yieldAmount}
              onChange={(e) => setYieldAmount(e.target.value)}
              aria-label="1배합 산출량"
              className={`${inputBase} flex-1`}
            />
            <select
              value={yieldUnit}
              onChange={(e) => setYieldUnit(e.target.value)}
              aria-label="산출 단위"
              className={`${inputBase} w-28`}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={forNewbie}
            onChange={(e) => setForNewbie(e.target.checked)}
            className="h-5 w-5 accent-orange-500"
          />
          <span className="text-[14px]">신입이 첫 주에 만드는 메뉴</span>
        </label>
      </section>

      {/* ---------- 재료 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">
          재료 <span className="text-orange-600">*</span>
        </h2>
        <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
          배수 계산의 기준입니다. &ldquo;적당히&rdquo;는 넣을 수 없습니다.
        </p>

        <ul className="mt-3 flex flex-col gap-3">
          {ings.map((row, i) => (
            <li
              key={i}
              className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex gap-2">
                <input
                  value={row.name}
                  onChange={(e) => updateIng(i, { name: e.target.value })}
                  placeholder="재료 이름"
                  aria-label={`재료 ${i + 1} 이름`}
                  className={`${inputBase} flex-1`}
                />
                {ings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIngs((p) => p.filter((_, n) => n !== i))}
                    aria-label={`재료 ${i + 1} 삭제`}
                    className="shrink-0 rounded-xl border-2 border-zinc-300 px-3 text-[18px] text-zinc-400 dark:border-zinc-700"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateIng(i, { amount: e.target.value })}
                  placeholder="양"
                  aria-label={`재료 ${i + 1} 양`}
                  className={`${inputBase} w-24`}
                />
                <select
                  value={row.unit}
                  onChange={(e) => updateIng(i, { unit: e.target.value })}
                  aria-label={`재료 ${i + 1} 단위`}
                  className={`${inputBase} w-24`}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  value={row.note}
                  onChange={(e) => updateIng(i, { note: e.target.value })}
                  placeholder="메모 (예: 60%)"
                  aria-label={`재료 ${i + 1} 메모`}
                  className={`${inputBase} flex-1`}
                />
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setIngs((p) => [...p, { ...EMPTY_ING }])}
          className="mt-3 w-full rounded-xl border-2 border-dashed border-zinc-300 py-3 text-[14px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
        >
          + 재료 추가
        </button>
      </section>

      {/* ---------- 순서 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">만드는 순서</h2>
        <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
          비워두고 저장해도 됩니다. 나중에 채워도 되고, 영상으로 대신해도 됩니다.
        </p>

        <ul className="mt-3 flex flex-col gap-3">
          {steps.map((row, i) => (
            <li
              key={i}
              className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex gap-2">
                <span className="mt-3 shrink-0 text-[13px] font-bold text-zinc-400">
                  {i + 1}
                </span>
                <input
                  value={row.title}
                  onChange={(e) => updateStep(i, { title: e.target.value })}
                  placeholder="무엇을 하나요"
                  aria-label={`순서 ${i + 1} 제목`}
                  className={`${inputBase} flex-1`}
                />
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSteps((p) => p.filter((_, n) => n !== i))}
                    aria-label={`순서 ${i + 1} 삭제`}
                    className="shrink-0 rounded-xl border-2 border-zinc-300 px-3 text-[18px] text-zinc-400 dark:border-zinc-700"
                  >
                    ×
                  </button>
                )}
              </div>
              <textarea
                value={row.desc}
                onChange={(e) => updateStep(i, { desc: e.target.value })}
                placeholder="설명 (선택)"
                aria-label={`순서 ${i + 1} 설명`}
                rows={2}
                className={`mt-2 ${inputBase}`}
              />
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setSteps((p) => [...p, { ...EMPTY_STEP }])}
          className="mt-3 w-full rounded-xl border-2 border-dashed border-zinc-300 py-3 text-[14px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
        >
          + 순서 추가
        </button>
      </section>

      {error && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* ---------- 저장 (하단 고정) ---------- */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto max-w-[720px]">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="w-full rounded-xl bg-orange-500 py-4 text-[16px] font-bold text-white active:bg-orange-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            저장
          </button>
          {!canSave && (
            <p className="mt-2 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
              메뉴 이름과 재료 한 줄은 있어야 저장됩니다.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
