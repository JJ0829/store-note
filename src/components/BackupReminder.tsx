"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  backupStatus,
  loadLastBackup,
  recordDates,
  type BackupStatus,
} from "@/lib/backup";
import { loadPunches } from "@/lib/attendance";
import { loadSales } from "@/lib/sales";

/* ------------------------------------------------------------------ *
 * 첫 화면의 백업 재촉.
 *
 * 백업 화면 안에만 두면 아무 의미가 없다 — 백업을 안 하는 사람은
 * 그 화면을 열지 않는다. 그래서 매일 열리는 첫 화면에 띄운다.
 *
 * 대신 조건을 좁게 잡는다. 조용해야 할 때 조용하지 않으면 사람은
 * 경고 자체를 무시하게 되고, 그때부터 진짜 경고도 안 보인다.
 *
 *   - 잃을 기록이 쌓였을 때만 뜬다 (`backupStatus` 참조)
 *   - 7일치 미만이면 아예 안 띄운다. 백업 화면 안에서만 알려준다
 *   - 닫는 버튼을 두지 않는다. 닫히면 다음부터 안 보이고, 그러면
 *     기능이 없는 것과 같아진다. 대신 뜨는 조건을 좁혔다
 *   - 사장님 잠금(PIN)과 무관하게 보인다. 여기엔 숫자가 없다 —
 *     "며칠치가 쌓였다"까지다. 직원이 봐도 상관없고, 오히려 정작
 *     사장님이 잠금을 안 열면 안 보이는 쪽이 위험하다
 * ------------------------------------------------------------------ */

export default function BackupReminder() {
  const [status, setStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    // localStorage는 서버에 없다. 렌더 후에 읽는다
    try {
      setStatus(
        backupStatus(recordDates(loadPunches(), loadSales()), loadLastBackup()),
      );
    } catch {
      /* 저장소를 못 읽는 환경이면 조용히 넘어간다 */
    }
  }, []);

  // 7일치 미만은 첫 화면에서 말하지 않는다
  if (!status || (status.level !== "warn" && status.level !== "danger")) {
    return null;
  }

  const danger = status.level === "danger";

  return (
    <Link
      href="/backup"
      className={[
        "mt-5 flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5",
        danger
          ? "border-red-300 bg-red-50 active:bg-red-100 dark:border-red-900 dark:bg-red-950/40"
          : "border-amber-300 bg-amber-50 active:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40",
      ].join(" ")}
    >
      <span className="min-w-0">
        <span
          className={[
            "block text-[15px] font-bold",
            danger
              ? "text-red-800 dark:text-red-300"
              : "text-amber-900 dark:text-amber-300",
          ].join(" ")}
        >
          백업 안 된 기록 {status.unbackedDays}일치
        </span>
        <span
          className={[
            "mt-0.5 block text-[12px] leading-relaxed",
            danger
              ? "text-red-800/80 dark:text-red-300/80"
              : "text-amber-900/80 dark:text-amber-300/80",
          ].join(" ")}
        >
          {status.message}
        </span>
      </span>
      <span
        aria-hidden
        className={[
          "shrink-0 text-lg",
          danger ? "text-red-500" : "text-amber-500",
        ].join(" ")}
      >
        ›
      </span>
    </Link>
  );
}
