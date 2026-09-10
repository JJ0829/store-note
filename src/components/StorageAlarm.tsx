"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { healthMessage, probeStorage, type StorageHealth } from "@/lib/storageHealth";

/* ------------------------------------------------------------------ *
 * 저장소가 죽었다는 것을 첫 화면에서 말한다.
 *
 * ★ 이게 없으면 하루가 통째로 날아간다.
 *
 *   시크릿 모드나 "사이트 데이터 차단" 이면 모든 쓰기가 실패한다. 그런데
 *   아침에 쓰는 화면(오픈 체크리스트·프렙)은 **일부러 조용한 쪽**이다
 *   (`21_화면명세` §7-①: 체크는 잃어도 그날 일은 계속해야 한다).
 *   그래서 마감에 매출을 넣다가 처음 알게 되고, 그때는 이미 늦었다.
 *
 *   개별 저장 알림을 시끄럽게 만들어서 푸는 문제가 아니다. §7-① 은 맞다.
 *   **환경이 죽은 것은 환경 얘기로 한 번 하면 된다.**
 *
 * 백업 재촉(`BackupReminder`)과 다른 점 —
 *   재촉은 "받아 두세요" 이고 이건 "지금 안 남고 있습니다" 다.
 *   그래서 **재촉보다 위에** 두고 색도 더 세게 쓴다. 둘 다 뜨는 날은
 *   이쪽이 먼저 해결돼야 한다 (저장이 안 되면 백업 날짜도 안 남는다).
 * ------------------------------------------------------------------ */

export default function StorageAlarm() {
  const [health, setHealth] = useState<StorageHealth | null>(null);

  useEffect(() => {
    // localStorage 는 서버에 없다. 렌더 후에 본다
    setHealth(probeStorage());
  }, []);

  if (!health || health.state === "ok") return null;

  const msg = healthMessage(health);
  if (!msg) return null;

  const blocked = health.state === "blocked";

  return (
    <div
      role="alert"
      className="mt-5 rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-3.5 dark:border-red-800 dark:bg-red-950/50"
    >
      <p className="text-[15px] font-bold text-red-800 dark:text-red-300">
        {blocked ? "기록이 저장되지 않습니다" : "저장 공간이 찼습니다"}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-red-800/85 dark:text-red-300/85">
        {msg}
      </p>
      {/* 공간이 찬 경우에만 지금 할 수 있는 일이 있다 — 받아서 빼두는 것.
          막힌 경우는 저장이 아예 안 되므로 백업 화면으로 보내도 소용없다 */}
      {!blocked && (
        <Link
          href="/backup"
          className="mt-2.5 inline-block rounded-xl border-2 border-red-400 px-3.5 py-2 text-[13px] font-bold text-red-800 active:bg-red-100 dark:border-red-700 dark:text-red-300"
        >
          지금 백업 받기 ›
        </Link>
      )}
    </div>
  );
}
