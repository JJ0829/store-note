"use client";

import { useEffect, useState } from "react";
import { hasAny, probe, type Found } from "@/lib/mediaProbe";

/* ------------------------------------------------------------------ *
 * 한 항목의 사진·영상.
 *
 * `public/media/`에 아래 이름으로 넣으면 붙는다. JSON은 안 고친다.
 *   {base}-good.jpg   좋은 예
 *   {base}-bad.jpg    나쁜 예
 *   {base}.mp4        영상
 *
 * 없으면 아무것도 그리지 않는다. 빈 칸이 잔뜩 뜨면 미완성으로 보이고,
 * 시연에서 그게 제일 눈에 걸린다. 무엇을 더 찍어야 하는지는
 * `/shoot` 화면에서 한눈에 본다.
 * ------------------------------------------------------------------ */

export default function MediaSlot({ base }: { base: string }) {
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    let alive = true;
    void probe(base).then((f) => alive && setFound(f));
    return () => {
      alive = false;
    };
  }, [base]);

  if (!hasAny(found) || !found) return null;

  const pair = [
    found.good && { src: found.good, label: "이렇게", good: true },
    found.bad && { src: found.bad, label: "이러면 안 됨", good: false },
  ].filter(Boolean) as { src: string; label: string; good: boolean }[];

  return (
    <div className="mt-2">
      {pair.length > 0 && (
        <div className={pair.length === 2 ? "grid grid-cols-2 gap-2" : ""}>
          {pair.map((p) => (
            <figure key={p.src} className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.label}
                loading="lazy"
                className={[
                  "w-full rounded-xl border-2 object-cover",
                  pair.length === 2 ? "aspect-[4/3]" : "max-h-72",
                  p.good
                    ? "border-emerald-300 dark:border-emerald-800"
                    : "border-red-300 dark:border-red-900",
                ].join(" ")}
              />
              <figcaption
                className={[
                  "mt-1 text-center text-[11px] font-bold",
                  p.good
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400",
                ].join(" ")}
              >
                {p.label}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {found.video && (
        <video
          src={found.video}
          controls
          preload="metadata"
          playsInline
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-black dark:border-zinc-800"
        />
      )}
    </div>
  );
}
