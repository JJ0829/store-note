"use client";

import { useEffect, useState } from "react";
import { loadRoster } from "@/lib/roster";
import { clearWho, loadWho, saveWho, type WhoAmI } from "@/lib/whoami";

/* ------------------------------------------------------------------ *
 * "지금 누가 쓰고 있나" 한 줄.
 *
 * ★ 공용 태블릿이라 세 사람이 같은 화면을 누른다. 이름이 없으면 체크는
 *   남는데 **누가 눌렀는지가 없어서** 되짚을 수가 없다 (사장님 요청 2026-09-12).
 *
 * ⚠️ 잠그지 않는다. 로그인으로 만들면 바쁠 때 그냥 남의 이름으로 누른다 —
 *   그러면 기록이 더 나빠진다. **누르는 데 걸리는 시간이 0에 가까워야** 한다.
 * ⚠️ 영업일이 바뀌면 저절로 잊는다 (`loadWho`). 어제 사람이 오늘 체크의
 *   주인이 되면 안 된다.
 * ------------------------------------------------------------------ */
export default function WhoBar({
  onChange,
}: {
  /** 고른 사람이 바뀌면 알려준다 (화면이 그 이름으로 기록하게) */
  onChange?: (who: WhoAmI | null) => void;
}) {
  const [who, setWho] = useState<WhoAmI | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = loadWho();
    setWho(w);
    onChange?.(w);
    setStaff(loadRoster().staff.map((s) => ({ id: s.id, name: s.name })));
    setReady(true);
    // onChange 는 부모가 매번 새로 만들 수 있어서 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;

  function pick(id: string, name: string) {
    saveWho(id, name);
    const w = loadWho();
    setWho(w);
    onChange?.(w);
    setOpen(false);
  }

  /* 직원이 아직 없으면 이 줄을 띄우지 않는다 — 고를 것이 없는데 물으면
     «뭘 하라는 거지» 가 된다. 근무표에 사람을 넣으면 그때 나타난다 */
  if (staff.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          지금 누가 하나요?{" "}
          <b className={who ? "text-zinc-800 dark:text-zinc-100" : "text-red-600 dark:text-red-400"}>
            {who ? who.name : "안 골랐습니다"}
          </b>
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[12px] font-semibold dark:border-zinc-700"
          >
            {who ? "바꾸기" : "고르기"}
          </button>
          {who && (
            <button
              type="button"
              onClick={() => {
                clearWho();
                setWho(null);
                onChange?.(null);
              }}
              className="px-1.5 text-[12px] text-zinc-400"
            >
              끄기
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id, s.name)}
              className={[
                "rounded-lg border-2 px-2.5 py-1.5 text-[13px] font-semibold",
                who?.staffId === s.id
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200",
              ].join(" ")}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!who && (
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          안 골라도 체크는 됩니다. 다만 <b>나중에 되짚을 때 시각만 남습니다.</b>
        </p>
      )}
    </div>
  );
}
