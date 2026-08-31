import Link from "next/link";
import CopyLinkButton from "@/components/CopyLinkButton";
import { countCritical, countTasks, getStore, listPositions } from "@/lib/repo";

// 사장님·매니저가 보는 화면. 여기서 링크를 복사해 카카오톡으로 보낸다.
export default function Home() {
  const store = getStore();
  const positions = listPositions();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{store.name}</p>
      <h1 className="mt-1 text-2xl font-bold">포지션별 체크리스트</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        포지션마다 화면이 두 가지입니다. 첫날 교육은{" "}
        <b>매장 태블릿</b>에서 <b>교육 모드</b>로 보여주고, 그 뒤에 혼자
        확인할 수 있게 <b>체크리스트</b> 링크를 보내주세요.
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {positions.map((position) => (
          <li
            key={position.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="truncate text-[15px] font-bold">
              {position.name}
              <span className="ml-1.5 text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
                {position.subtitle}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {countTasks(position)}개 항목 · 꼭 지키기{" "}
              {countCritical(position)}개
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {/* 태블릿에서 첫날 교육용 */}
              <Link
                href={`/t/${position.shareSlug}`}
                className="flex items-center justify-between rounded-xl bg-orange-500 px-4 py-3 text-white active:bg-orange-600"
              >
                <span className="text-[14px] font-bold">교육 모드로 열기</span>
                <span className="text-[11px] opacity-80">태블릿 · 한 장씩</span>
              </Link>

              {/* 신입에게 보내는 공유 링크 */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/p/${position.shareSlug}`}
                  className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-700"
                >
                  <span className="text-[14px] font-semibold">체크리스트</span>
                  <span className="ml-2 font-mono text-[11px] text-zinc-400">
                    /p/{position.shareSlug}
                  </span>
                </Link>
                <CopyLinkButton path={`/p/${position.shareSlug}`} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 rounded-xl bg-zinc-100 px-3.5 py-3 text-[12px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        지금은 체크리스트 내용이 <code>data/seed.json</code> 파일에 들어 있습니다.
        실제 매장이 정해지면 그 매장의 포지션으로 이 파일을 고치거나, 다음
        단계에서 만들 편집 화면으로 옮기면 됩니다.
      </p>
    </main>
  );
}
