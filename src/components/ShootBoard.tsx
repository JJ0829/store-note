"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/copyText";
import BackButton from "@/components/BackButton";
import ShootPlanner from "@/components/ShootPlanner";
import { expectedNames, forget, probeAll, type Found } from "@/lib/mediaProbe";

type Slot = "good" | "bad" | "video";

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

function Row({
  item,
  found,
  onChanged,
}: {
  item: ShootItem;
  found?: Found;
  /** 넣거나 지운 뒤 목록을 다시 읽게 한다 */
  onChanged: () => void;
}) {
  const names = expectedNames(item.id);
  const [busy, setBusy] = useState<Slot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function upload(slot: Slot, file: File) {
    setBusy(slot);
    setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("base", item.id);
    fd.set("slot", slot);
    try {
      const r = await fetch("/api/media", { method: "POST", body: fd });
      const j = (await r.json()) as { ok?: boolean; reason?: string };
      /* ★ 실패를 삼키지 않는다. 넣은 줄 알고 넘어가면 발표장에서 회색 네모를 본다 */
      if (!j.ok) setErr(j.reason ?? "넣지 못했습니다");
      else onChanged();
    } catch {
      setErr("서버에 닿지 못했습니다");
    } finally {
      setBusy(null);
    }
  }

  async function remove(url: string) {
    const name = url.split("/").pop() ?? "";
    if (!window.confirm(`${name} 을(를) 지웁니다. 되돌릴 수 없습니다.`)) return;
    setErr(null);
    try {
      const r = await fetch(`/api/media?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const j = (await r.json()) as { ok?: boolean; reason?: string };
      if (!j.ok) setErr(j.reason ?? "지우지 못했습니다");
      else onChanged();
    } catch {
      setErr("서버에 닿지 못했습니다");
    }
  }

  /**
   * 한 자리.
   *
   * ★ 비어 있으면 **폰 카메라가 바로 열리는 버튼**이다
   *   (`capture="environment"` — 뒷면 카메라). 전에는 파일명만 복사해 주고
   *   폴더에 직접 넣으라고 했는데, 주방에서 폰을 들고 그걸 할 사람은 없다.
   * ★ 들어와 있으면 **미리보기 + [바꾸기] + [지우기]** 다.
   */
  const cell = (label: string, slot: Slot, want: string, url?: string) => {
    const video = slot === "video";
    return (
      <div className="flex min-w-0 flex-col gap-1">
        {url ? (
          <>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-emerald-300 dark:border-emerald-800"
            >
              {video ? (
                <video
                  src={url}
                  className="h-16 w-full bg-black object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`${item.title} ${label}`} className="h-16 w-full object-cover" />
              )}
            </a>
            <div className="flex gap-1">
              <label className="flex-1 cursor-pointer rounded-md border border-zinc-300 py-1 text-center text-[10px] font-semibold dark:border-zinc-700">
                바꾸기
                <input
                  type="file"
                  className="hidden"
                  accept={video ? "video/*" : "image/*"}
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(slot, f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void remove(url)}
                className="rounded-md border border-red-300 px-1.5 py-1 text-[10px] font-semibold text-red-600 dark:border-red-900 dark:text-red-400"
              >
                지우기
              </button>
            </div>
          </>
        ) : (
          <label
            title={`${want} — 눌러서 찍거나 고르기`}
            className="flex h-[74px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-[11px] text-zinc-500 active:bg-zinc-50 dark:border-zinc-700 dark:active:bg-zinc-800"
          >
            <span aria-hidden className="text-[17px] leading-none">
              {busy === slot ? "…" : video ? "🎬" : "📷"}
            </span>
            <span>{busy === slot ? "넣는 중" : label}</span>
            <input
              type="file"
              className="hidden"
              accept={video ? "video/*" : "image/*"}
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(slot, f);
              }}
            />
          </label>
        )}
      </div>
    );
  };

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
        <button
          type="button"
          onClick={() => void copyText(item.id, "이 이름으로 저장하세요")}
          title="파일명 앞부분 복사 — 컴퓨터에서 직접 넣을 때 씁니다"
          className="mt-0.5 font-mono text-[11px] text-zinc-400 underline decoration-dotted"
        >
          {item.id}
        </button>
        {err && (
          <p role="alert" className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
            {err}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:w-[300px]">
        {cell("좋은 예", "good", names.good, found?.good)}
        {cell("나쁜 예", "bad", names.bad, found?.bad)}
        {cell("영상", "video", names.video, found?.video)}
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

  /* 넣거나 지운 뒤 — 목록은 한 번만 받아 캐시해 두므로 **버리고 다시 받아야** 한다.
     안 그러면 방금 넣은 것이 화면에 안 붙고 사람은 실패한 줄 안다 */
  const reload = useCallback(() => {
    forget();
    void probeAll(items.map((i) => i.id)).then(setMedia);
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
        <p className="font-bold">넣는 방법 — 이 화면에서 바로 찍습니다</p>
        <ol className="mt-1.5 list-decimal pl-5 text-zinc-600 dark:text-zinc-300">
          <li>
            빈 자리(<b>📷 좋은 예 · 나쁜 예 · 🎬 영상</b>)를 누르면{" "}
            <b>폰 카메라가 바로 열립니다.</b> 찍으면 그 자리에 붙습니다 —
            파일명을 맞출 필요도, 새로고침할 필요도 없습니다
          </li>
          <li>
            영상은 <b>30초면 충분하고 편집 안 해도 됩니다.</b> 좋은 예 하나만
            있어도 되고, 나쁜 예는 없으면 안 보입니다
          </li>
          <li>
            잘못 찍었으면 <b>[바꾸기]</b> 또는 <b>[지우기]</b>. 컴퓨터에서 직접
            넣고 싶으면 항목 아래 <b>파일명을 눌러 복사</b>해서{" "}
            <code className="font-mono text-[12px]">public/media/</code> 폴더에
            그 이름으로 두면 됩니다
          </li>
        </ol>
        {/* ★ 저장되는 곳을 화면이 말해야 한다 (사장님 질문 2026-09-12:
            "여기에 저장되는 폴더 어디 있는데"). 코드 주석에만 있으면
            쓰는 사람은 영영 모른다 */}
        <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <b>어디에 저장되나</b> — 이 앱을 띄운 컴퓨터의{" "}
          <code className="font-mono">store-note/public/media/</code> 폴더입니다.
          파일 이름은 <code className="font-mono">항목id-good.jpg</code> ·{" "}
          <code className="font-mono">항목id-bad.jpg</code> ·{" "}
          <code className="font-mono">항목id.mp4</code> 형태로 저장됩니다.
          <br />
          ⚠️ <b>배포본(Vercel)에서는 저장이 안 됩니다</b> — 그쪽은 폴더가 읽기
          전용입니다. 넣는 것은 <b>매장 컴퓨터에서 띄운 앱</b>으로 하세요.
          실패하면 화면이 빨간 글씨로 알려줍니다.
        </p>
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
              <Row key={i.id} item={i} found={media.get(i.id)} onChanged={reload} />
            ))}
          </ul>
        </section>
      )}

      {groups.map(([group, list]) => (
        <section key={group} className="mt-7">
          <h2 className="text-[15px] font-bold">{group}</h2>
          <ul className="mt-2 rounded-2xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
            {list.map((i) => (
              <Row key={i.id} item={i} found={media.get(i.id)} onChanged={reload} />
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
