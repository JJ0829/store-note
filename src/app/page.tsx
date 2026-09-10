import Link from "next/link";
import BackupReminder from "@/components/BackupReminder";
import StorageAlarm from "@/components/StorageAlarm";
import CopyLinkButton from "@/components/CopyLinkButton";
import NowPanel from "@/components/NowPanel";
import { OwnerLockButton } from "@/components/OwnerGate";
import { StoreLockButton } from "@/components/StoreGate";
import {
  countCritical,
  countTasks,
  countedTasks,
  getStore,
  irreversibleTasks,
  listPositions,
  listPrepLists,
  listRecipes,
  listShifts,
} from "@/lib/repo";

/**
 * 매장 태블릿의 첫 화면.
 *
 * 맨 위는 "지금 이 시간에 뭘 해야 하는가"다. 그 아래에 전체 목록을 둔다.
 * 순서를 반대로 하면(목록 먼저) 사람이 매번 찾아야 해서 안 쓰게 된다.
 */
/** 목록 한 칸. 새로 붙은 화면이 일곱 개라 같은 모양으로 맞춘다 */
function Tile({
  href,
  name,
  note,
  lock,
}: {
  href: string;
  name: string;
  note: string;
  /** 사장님만 보는 화면 표시 */
  lock?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">
          {name}
          {lock && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">🔒</span>}
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {note}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-lg text-zinc-400">
        ›
      </span>
    </Link>
  );
}

export default function Home() {
  const store = getStore();
  const positions = listPositions();
  const prepLists = listPrepLists();
  const recipes = listRecipes();
  const shifts = listShifts();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{store.name}</p>
      <h1 className="mt-1 text-2xl font-bold">오늘</h1>

      {/* ---------- 저장이 아예 안 되는 상태 ----------
          재촉보다 위다. 저장이 안 되면 백업 날짜도 안 남으므로
          이쪽이 먼저 해결돼야 한다. */}
      <StorageAlarm />

      {/* ---------- 백업 재촉 ----------
          "지금 뭘 해야 하는가" 보다 위에 둔다. 잃을 기록이 7일치 넘게
          쌓였을 때만 뜨므로, 뜬 날은 그게 그날 가장 급한 일이다. */}
      <BackupReminder />

      {/* ---------- 지금 시간에 맞는 화면 ---------- */}
      <NowPanel shifts={shifts} />

      {/* ---------- 프렙 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">프렙</h2>
        <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          오늘 해야 내일 쓸 수 있는 것들입니다.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {prepLists.map((list) => {
            const cannotBuy = irreversibleTasks(list).length;
            return (
              <li key={list.id}>
                <Link
                  href={`/prep/${list.slug}`}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">
                      {list.name}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                      {/* ★ 프렙 화면과 같은 규칙으로 센다. `list.tasks.length` 를
                          그대로 쓰면 홈은 "11개" 인데 들어가면 "0/5" 다 (2026-09-10) */}
                      {countedTasks(list)}개
                      {cannotBuy > 0 && (
                        <>
                          {" · "}
                          <b className="text-red-600 dark:text-red-400">
                            까먹지 말 것 {cannotBuy}개
                          </b>
                        </>
                      )}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-lg text-zinc-400">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- 사람 ---------- */}
      {/* 근무표(계획) → 출퇴근(실제) → 계약서(조건). 이 순서로 이어진다 */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">사람</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          근무표가 계획, 출퇴근이 실제입니다. 두 개의 차이가 근태이고,
          계약서의 시급을 곱하면 인건비가 됩니다.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Tile
            href="/roster"
            name="이번 주 근무표"
            note="누가 언제 나오는지 정하고 직원들에게 보냅니다"
          />
          <Tile
            href="/attendance"
            name="출퇴근 · 근태"
            note="버튼 두 개로 찍습니다. 지각·연장·휴게시간을 근무표와 비교해 봅니다"
          />
          <Tile
            href="/contracts"
            name="근로계약서"
            note="서면 교부·최저임금·주휴수당·보관 기한을 점검합니다"
            lock
          />
          {/*
            출퇴근·계약 바로 아래에 둔다.
            이 둘이 근로기준법 제42조로 3년 보존 대상인데 저장소가
            태블릿 하나뿐이라, 백업이 '설정' 같은 데 숨어 있으면 안 된다.
          */}
          <Tile
            href="/backup"
            name="내보내기 · 되돌리기"
            note="출퇴근·계약은 3년 보관해야 합니다. 태블릿을 잃으면 사라지니 한 달에 한 번 내려받으세요"
            lock
          />
        </div>
      </section>

      {/* ---------- 돈 ---------- */}
      {/* 거래처(단가) → 원가, 프렙의 발주 항목 → 발주, 그리고 매출에서 뺀다 */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">돈</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          거래처 단가를 넣으면 레시피에서 원가가 나오고, 출퇴근에서 인건비가
          나옵니다. 매출에서 둘을 빼면 그날 남은 돈입니다.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Tile
            href="/sales"
            name="매출"
            note="마감에 세 칸만 넣으면 매출 − 재료비 − 인건비가 계산됩니다"
            lock
          />
          <Tile
            href="/cost"
            name="원가"
            note="메뉴별 재료비와 원가율. 목표 원가율에서 판매가를 거꾸로 계산합니다"
            lock
          />
          <Tile
            href="/order"
            name="발주"
            note="주문 마감까지 남은 시간, 주문했는데 안 들어온 것"
          />
          <Tile
            href="/vendors"
            name="거래처"
            note="전화·마감 시각·배송 요일과 품목 단가. 원가가 여기서 나옵니다"
            lock
          />
        </div>

        <OwnerLockButton />
      </section>

      {/* ---------- 포지션 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">포지션별 체크리스트</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          첫날 교육은 태블릿에서 교육 모드로 보여주고, 그 뒤에 혼자 확인할 수
          있게 체크리스트 링크를 보내주세요.
        </p>

        <ul className="mt-3 flex flex-col gap-3">
          {positions.map((position) => (
            <li
              key={position.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="truncate text-[15px] font-bold">
                {position.name}
                <span className="ml-1.5 text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
                  {position.subtitle}
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {countTasks(position)}개 항목 · 꼭 지키기{" "}
                {countCritical(position)}개
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/t/${position.shareSlug}`}
                  className="flex items-center justify-between rounded-xl bg-orange-500 px-4 py-3 text-white active:bg-orange-600"
                >
                  <span className="text-[14px] font-bold">교육 모드로 열기</span>
                  <span className="text-[11px] opacity-80">태블릿 · 한 장씩</span>
                </Link>

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
      </section>

      {/* ---------- 촬영 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">촬영</h2>
        <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          사진·영상이 붙은 항목만 화면에 보입니다. 뭘 더 찍어야 하는지 여기서 봅니다.
        </p>
        <Link
          href="/shoot"
          className="mt-3 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
        >
          <span className="text-[15px] font-bold">촬영 진행 보기</span>
          <span aria-hidden className="text-lg text-zinc-400">›</span>
        </Link>
      </section>

      {/* ---------- 레시피 ---------- */}
      <section id="recipes" className="mt-8">
        <h2 className="text-[15px] font-bold">레시피</h2>
        <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          이름으로 찾고, 필요한 만큼 배수로 계산합니다.
        </p>

        <Link
          href="/prep"
          className="mt-3 flex items-center justify-between rounded-2xl bg-zinc-900 px-4 py-3.5 text-white active:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="text-[15px] font-bold">
            레시피 찾기
            <span className="ml-2 text-[12px] font-normal opacity-70">
              {recipes.length}개
            </span>
          </span>
          <span aria-hidden className="text-lg leading-none">
            ›
          </span>
        </Link>

        <ul className="mt-2 flex flex-wrap gap-2">
          {recipes.map((r) => (
            <li key={r.id}>
              <Link
                href={`/r/${r.slug}`}
                className="block rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <b>{r.name}</b>
                <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                  1배합 {r.yield.amount}
                  {r.yield.unit}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/*
          매장 번호는 레시피 옆에 둔다.
          사장님 잠금 버튼 옆에 나란히 두면 둘이 같은 것으로 읽힌다 —
          하나는 직원에게 알려주는 번호이고 하나는 사장님만 아는 번호다.
        */}
        <StoreLockButton />
      </section>
    </main>
  );
}
