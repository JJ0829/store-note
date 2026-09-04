"use client";

import { useState } from "react";
import { copyText } from "@/lib/copyText";

export default function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    // 직접 navigator.clipboard 를 부르면 평문 HTTP(매장 태블릿)에서 곧바로
    // prompt 창으로 떨어진다. copyText 는 가운데 execCommand 단계가 있어서
    // 거기서도 대개 조용히 복사된다. 복사 지점은 전부 이걸 거친다.
    const r = await copyText(
      url,
      "아래 주소를 복사해서 카카오톡에 붙여넣으세요",
    );
    if (r === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:active:bg-zinc-800"
    >
      {copied ? "복사됨" : "링크 복사"}
    </button>
  );
}
