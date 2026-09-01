"use client";

import { useRouter } from "next/navigation";

/**
 * 뒤로 가기.
 *
 * 매장 태블릿에는 브라우저 주소창이 없는 경우가 많다(전체화면 키오스크).
 * 화면 안에 뒤로 가기가 없으면 갇힌다.
 */
export default function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        // 링크로 바로 들어온 경우엔 뒤로 갈 곳이 없다
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      aria-label="뒤로 가기"
      className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-semibold text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:active:bg-zinc-800"
    >
      <span aria-hidden className="text-base leading-none">
        ‹
      </span>
      뒤로
    </button>
  );
}
