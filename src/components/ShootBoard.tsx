"use client";

import { useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/copyText";
import BackButton from "@/components/BackButton";
import ShootPlanner from "@/components/ShootPlanner";
import { expectedNames, probeAll, type Found } from "@/lib/mediaProbe";

/* ------------------------------------------------------------------ *
 * 촬영 진행 화면.
 *
 * 사진·영상이 없는 항목은 다른 화면에서 아무것도 안 보여준다. 그래야
 * 시연이 깨끗하다. 대신 "무엇을 더 찍어야 하는가"는 여기서 본다.
 *
 * 파일명을 눌러 복사하고, 그 이름으로 저장해 `public/media/`에 넣으면 끝이다.
 * ------------------------------------------------------------------ */

export type ShootItem = {
  id: string;
  title: string;
  group: string;
  critical: boolean;
  /** 기준이 사람마다 가장 갈리는 항목 — 먼저 찍어야 한다 */
  priority?: string;
};

function Row({ item, found }: { item: ShootItem; found?: Found }) {
  const names = expectedNames(item.id);

  const copy = (name: string) => {
    void copyText(name, "이 이름으로 저장하세요");
  };

  const cell = (label: string, name: string, url?: string) => (
    <button
      type="button"
      onClick={() => copy(name)}
      title={url ? `${name} — 들어와 있음` : `${name} — 눌러서 파일명 복사`}
      className={[
        "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
        url
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 dark:border-zinc-700",
      ].join(" ")}
    >
      <span aria-hidden>{url ? "✓" : "＋"}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <li className="flex flex-col gap-2 border-b border-zinc-200 py-3 last:border-0 sm:flex-row sm:items-center dark:border-zinc-800">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-snug">
          {item.priority && (
            <span className="mr-1.5 rounded-md bg-orange-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              먼저
            </span>
          )}
          {item.title}
          {item.critical && (
            <span className="ml-1.5 text-[11px] font-normal text-red-600 dark:text-red-400">
              꼭 지키기
            </span>
          )}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{item.id}</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:w-[300px]">
        {cell("좋은 예", names.good, found?.good)}
        {cell("나쁜 예", names.bad, found?.bad)}
        {cell("영상", names.video, found?.video)}
      </div>
    </li>
  );
}

export default function ShootBoard({
  items,
  storeName,
}: {
  items: ShootItem[];
  storeName: string;
}) {
  const [media, setMedia] = useState<Map<string, Found>>(new Map());

  // 폴더 목록을 한 번 받아 전부 판정한다
  useEffect(() => {
    let alive = true;
    void probeAll(items.map((i) => i.id)).then((m) => alive && setMedia(m));
    return () => {
      alive = false;
    };
  }, [items]);

  // 진행률은 "좋은 예 또는 영상"이 들어온 항목 기준.
  // 나쁜 예까지 다 채우라고 하면 시작을 못 한다.
  const done = items.filter((i) => {
    const f = media.get(i.id);
    return !!f && (!!f.good || !!f.video);
  }).length;

  const priority = useMemo(() => items.filter((i) => i.priority), [items]);
  const rest = useMemo(() => items.filter((i) => !i.priority), [items]);
  const groups = useMemo(() => {
    const m = new Map<string, ShootItem[]>();
    for (const i of rest) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m.entries()];
  }, [rest]);

  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[860px] bg-zinc-50 px-4 py-6 pb-24 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {storeName}
          </p>
          <h1 className="text-xl font-bold">촬영 진행</h1>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-orange-600 dark:text-orange-400">
          {done}/{items.length}
        </p>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-orange-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-[13px] leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-bold">넣는 방법</p>
        <ol className="mt-1.5 list-decimal pl-5 text-zinc-600 dark:text-zinc-300">
          <li>폰으로 찍습니다. 영상은 30초면 충분하고 편집 안 해도 됩니다</li>
          <li>
            아래에서 파일명을 눌러 복사하고, 그 이름으로 저장합니다
            <span className="ml-1 font-mono text-[11px] text-zinc-400">
              (jpg·png·mp4·mov 다 됩니다)
            </span>
          </li>
          <li>
            <code className="font-mono text-[12px]">public/media/</code> 폴더에
            넣고 이 화면을 새로고침합니다
          </li>
        </ol>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          좋은 예 하나만 있어도 화면에 붙습니다. 나쁜 예는 없으면 안 보이고,
          그래도 됩니다.
        </p>
      </div>

      {priority.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[15px] font-bold">먼저 찍을 것</h2>
          <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
            기준이 사람마다 가장 갈리는 항목입니다. 이것만 있어도 발표는 됩니다.
          </p>
          <ul className="mt-2 rounded-2xl border border-orange-200 bg-orange-50/60 px-4 dark:border-orange-900/60 dark:bg-orange-950/20">
            {priority.map((i) => (
              <Row key={i.id} item={i} found={media.get(i.id)} />
            ))}
          </ul>
        </section>
      )}

      {groups.map(([group, list]) => (
        <section key={group} className="mt-7">
          <h2 className="text-[15px] font-bold">{group}</h2>
          <ul className="mt-2 rounded-2xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
            {list.map((i) => (
              <Row key={i.id} item={i} found={media.get(i.id)} />
            ))}
          </ul>
        </section>
      ))}

      {/* ★ AI — 아래 목록은 **이미 있는 항목**의 촬영 진행이다.
          여기는 **없는 것을 무엇을 찍을지** 만드는 자리다.
          그래서 목록 아래에 둔다: 있는 걸 다 찍고 나서 볼 것이다 */}
      <ShootPlanner />
    </main>
  );
}
