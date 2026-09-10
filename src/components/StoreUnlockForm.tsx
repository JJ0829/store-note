"use client";

import { useState } from "react";
import { BTN_PRIMARY, Card, INPUT, Screen } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * 서버에 매장 PIN 을 확인받는 입력칸.
 *
 * `StoreGate`(브라우저 PIN)의 입력칸과 생김새는 비슷하지만 **하는 일이
 * 다르다.** 저쪽은 브라우저 안에서 비교하고 화면만 바꾼다. 이쪽은 서버에
 * 물어보고 쿠키를 받아야 **레시피가 그려진다.**
 *
 * 맞으면 `location.reload()` 한다 — 서버가 다시 그려야 내용이 온다.
 * 화면만 바꿔서는 받을 내용이 없다. 그게 이 잠금이 진짜인 이유다.
 * ------------------------------------------------------------------ */

export default function StoreUnlockForm({ title }: { title: string }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || pin.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/store-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await r.json()) as { ok: boolean; waitSec?: number };
      if (data.ok) {
        location.reload();
        return;
      }
      setMsg(
        data.waitSec
          ? `너무 여러 번 틀렸습니다. ${data.waitSec}초 뒤에 다시 해주세요.`
          : "번호가 맞지 않습니다.",
      );
    } catch {
      setMsg("서버에 연결하지 못했습니다. 잠시 뒤에 다시 해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={title}>
      <Card className="mt-5" title="매장 직원만 볼 수 있습니다">
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          레시피는 매장 자산입니다. 매장 번호를 넣어주세요.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            className={INPUT}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="매장 번호"
            aria-label="매장 번호"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "확인 중" : "열기"}
          </button>
        </div>
        {msg && (
          <p
            role="alert"
            className="mt-3 text-[13px] font-semibold text-red-600 dark:text-red-400"
          >
            {msg}
          </p>
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          번호를 모르면 사장님께 물어보세요. 이 번호는 <b>서버에 설정</b>되어
          있어서 이 기기에서 바꿀 수 없습니다.
        </p>
      </Card>
    </Screen>
  );
}
