"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ *
 * 첫 화면 오른쪽 위의 로그인 상태.
 *
 * ★ 네 가지를 서로 다르게 보여줘야 한다. 뭉뚱그리면 사장님이
 *   «왜 서버에 안 들어가지» 를 알 방법이 없다.
 *
 *   off       서버에 Supabase 설정이 없다 → **아무것도 안 띄운다**
 *             (지금까지와 똑같이 도는 상태다. 없는 기능을 광고하지 않는다)
 *   anon      로그인 안 함 → 「로그인」
 *   no-store  로그인은 됐는데 계정에 매장이 안 붙었다 → **빨간 안내**
 *             이 상태가 제일 헷갈린다. 로그인은 됐는데 아무것도 안 되기 때문이다
 *   ok        매장 이름 + 로그아웃
 *
 * ⚠️ 이 배지가 뜬다고 데이터가 서버로 가는 것은 아니다.
 *   화면들은 아직 localStorage 를 쓴다 — 옮기는 순서는 `24_DB이관순서.md`.
 * ------------------------------------------------------------------ */

type Me =
  | { state: "off" }
  | { state: "anon" }
  | { state: "no-store"; userId: string }
  | { state: "ok"; name: string; role: string; storeName: string };

export default function SessionBadge() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Me) => {
        if (alive) setMe(j);
      })
      /* 못 물어봤으면 조용히 아무것도 안 띄운다. 첫 화면이 오류로 뒤덮이면 안 된다 */
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setMe({ state: "anon" });
    router.refresh();
  }

  if (!me || me.state === "off") return null;

  if (me.state === "anon") {
    return (
      <Link
        href="/login"
        className="rounded-full border border-zinc-300 px-3 py-1 text-[12px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        로그인
      </Link>
    );
  }

  if (me.state === "no-store") {
    return (
      <Link
        href="/login"
        className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-[12px] font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        매장 연결 안 됨
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
        {me.storeName} · {me.name}
      </span>
      <button
        type="button"
        onClick={logout}
        className="rounded-full border border-zinc-300 px-2.5 py-1 text-[12px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        로그아웃
      </button>
    </span>
  );
}
