"use client";

import { useEffect } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ *
 * 화면 하나가 터졌을 때.
 *
 * ★ 이게 없으면 **흰 화면에 영어 한 줄**만 남는다 —
 *   `Application error: a client-side exception has occurred`.
 *   2026-09-10 에 실제로 봤다 (모양이 깨진 레시피가 하나 섞여 있었다).
 *   그 원인은 고쳤지만 **그런 일이 또 없으리라는 보장은 없다.**
 *
 *   심사 시연 중에 태블릿이 흰 화면이 되면 거기서 끝이다. 최소한
 *   **무엇을 하면 되는지**는 남겨야 한다 — 다시 시도 / 처음으로.
 *
 * ⚠️ 여기서 잘못을 사람 탓으로 돌리지 않는다. 사장님이 뭘 잘못한 게 아니다.
 *   그리고 오류 내용을 그대로 띄우지 않는다 — 영어 스택은 도움이 안 되고,
 *   파일 경로 같은 것이 섞여 나온다.
 * ------------------------------------------------------------------ */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 개발 중에는 콘솔에 남겨야 고칠 수 있다. 배포본에서는 조용하다
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-[17px] font-bold">이 화면을 여는 중에 문제가 생겼습니다</p>
      <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        입력하신 기록은 <b>이 기기에 그대로 있습니다.</b> 아래를 눌러 다시
        열어보세요. 계속 같으면 다른 화면으로 가셔도 됩니다.
      </p>

      <div className="mt-1 flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-2xl bg-orange-500 px-5 py-4 text-[16px] font-bold text-white active:bg-orange-600"
        >
          다시 열기
        </button>
        <Link
          href="/"
          className="w-full rounded-2xl border-2 border-zinc-300 px-5 py-4 text-[15px] font-semibold text-zinc-700 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200"
        >
          처음으로
        </Link>
      </div>

      {/* 사장님이 물어볼 때 짚을 수 있는 표식. 영어 스택은 안 띄운다 */}
      {error.digest && (
        <p className="text-[11px] text-zinc-400">오류 표식 {error.digest}</p>
      )}
    </main>
  );
}
