import Link from "next/link";

/* ------------------------------------------------------------------ *
 * 출퇴근 ↔ 근무표 전환 (2026-09-16)
 *
 * ★ 사장님 지적: *"근무표 따로 출퇴근 밑에 아이콘 따로 의미가 없잖아"*.
 *
 *   맞는 말이다. 둘은 **같은 격자**다 — 직원 × 날짜.
 *   근무표가 «계획», 출퇴근이 «실제», 그 차이가 근태다. 원래 한 몸인데
 *   화면이 둘이라 오갈 때마다 홈을 거쳐야 했다.
 *
 * ★ 그런데 **라우트를 합치지는 않았다.** 잠금이 다르기 때문이다 —
 *   출퇴근은 직원이 직접 찍는 화면이라 안 잠그고, 근무표는 사장님 PIN
 *   뒤에 있다(`OwnerGate`). 한 주소로 합치면 그 문을 화면 중간에
 *   끼워 넣어야 하고, 그러면 «찍으러 왔는데 번호를 묻는» 일이 생긴다.
 *
 *   대신 두 화면 맨 위에 이 스위치를 둬서 **한 번에 오간다.**
 * ------------------------------------------------------------------ */

const BASE =
  "flex-1 rounded-lg px-3 py-2 text-center text-[14px] font-bold transition-colors";

export default function WorkSwitch({ current }: { current: "punch" | "roster" }) {
  const on = "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50";
  const off =
    "text-zinc-500 active:bg-zinc-200 dark:text-zinc-400 dark:active:bg-zinc-700";

  return (
    <div
      role="tablist"
      aria-label="출퇴근과 근무표"
      className="mt-4 flex gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800"
    >
      <Link
        href="/attendance"
        role="tab"
        aria-selected={current === "punch"}
        className={`${BASE} ${current === "punch" ? on : off}`}
      >
        출퇴근 <span className="font-normal">(실제)</span>
      </Link>
      <Link
        href="/roster"
        role="tab"
        aria-selected={current === "roster"}
        className={`${BASE} ${current === "roster" ? on : off}`}
      >
        근무표 <span className="font-normal">(계획)</span>
      </Link>
    </div>
  );
}
