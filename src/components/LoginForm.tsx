"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BTN_PRIMARY, Caveat, INPUT } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * 로그인 화면.
 *
 * ★ 비밀번호는 **화면을 지나갈 뿐** 어디에도 안 남긴다 — `localStorage` 도,
 *   자동완성용 저장도 하지 않는다. 서버로 보내고 상태에서 지운다.
 *
 * ★ 틀린 이유를 자세히 말하지 않는다. "이메일이 없습니다" 라고 하면
 *   어느 주소가 이 매장 계정인지 알려주는 셈이다.
 * ------------------------------------------------------------------ */
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; waitSec?: number }
        | null;

      if (res.ok && j?.ok) {
        setPassword(""); // 성공해도 화면에 남겨두지 않는다
        router.replace("/");
        router.refresh(); // 서버 컴포넌트가 새 쿠키로 다시 그리게 한다
        return;
      }
      if (j?.reason === "too-many") {
        setMsg(`너무 여러 번 틀렸습니다. ${j.waitSec ?? 0}초 뒤에 다시 해 주세요.`);
      } else if (j?.reason === "not-configured") {
        setMsg("이 서버에는 로그인이 설정돼 있지 않습니다.");
      } else {
        setMsg("이메일이나 비밀번호가 맞지 않습니다.");
      }
    } catch {
      setMsg("연결하지 못했습니다. 인터넷을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold">이메일</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
          placeholder="owner@example.com"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold">비밀번호</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
          required
        />
      </label>

      <button type="submit" className={BTN_PRIMARY} disabled={busy}>
        {busy ? "확인하는 중…" : "로그인"}
      </button>

      {msg && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {msg}
        </p>
      )}

      <Caveat>
        로그인은 <b>사장님 계정</b>입니다. 직원은 로그인하지 않습니다 — 체크리스트는
        지금처럼 링크로 열립니다.
      </Caveat>
    </form>
  );
}
