import { cookies } from "next/headers";
import StoreGate from "@/components/StoreGate";
import StoreUnlockForm from "@/components/StoreUnlockForm";
import { STORE_COOKIE, cookieMatches, storePinConfigured } from "@/lib/serverGate";

/* ------------------------------------------------------------------ *
 * 레시피 화면을 감싸는 **서버** 게이트.
 *
 * ★ 여기가 이 잠금이 진짜가 되는 지점이다.
 *
 *   `StoreGate`(브라우저) 는 화면만 가린다 — 서버가 이미 레시피를 그려서
 *   보냈기 때문에 `curl` 로 읽힌다. 이 컴포넌트는 **서버에서** 쿠키를 보고,
 *   없으면 `children` 을 아예 렌더하지 않는다. 렌더를 안 하면 하이드레이션
 *   페이로드에도 안 실린다 — **보낼 것이 없으니 받아갈 것도 없다.**
 *
 * 세 갈래다.
 *
 *   ① STORE_PIN 없음  → 그냥 연다 + **빨간 띠로 크게 알린다**
 *      (사장님 결정 2026-09-10: 환경변수를 깜빡한 채 심사 시연에 들어가서
 *       레시피가 안 열리는 것이 더 큰 사고다. 대신 조용히 열지는 않는다)
 *      이때는 예전 동작 그대로 브라우저 PIN(`StoreGate`)이 가림막을 한다.
 *
 *   ② STORE_PIN 있음 · 쿠키 없음 → **레시피를 안 그린다.** 입력칸만 보낸다
 *
 *   ③ STORE_PIN 있음 · 쿠키 맞음 → 그린다. 브라우저 PIN 은 겹치지 않게 뺀다
 *      (서버가 이미 확인했는데 또 물으면 번호를 두 번 넣게 된다)
 *
 * ⚠️ `cookies()` 를 부르는 순간 이 화면은 **정적 생성에서 빠진다.**
 *   레시피는 어차피 잠금 뒤에 있어야 하므로 그게 맞다.
 * ------------------------------------------------------------------ */

export default async function ServerStoreGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  /* ★ 쿠키를 **항상** 먼저 읽는다. PIN 이 없을 때도 읽는다.
   *
   *  왜 — `cookies()` 를 부르면 이 화면이 정적 생성에서 빠진다. 조건부로
   *  부르면 **빌드 때 PIN 이 없었으면 정적 HTML 이 만들어지고**, 나중에
   *  런타임 환경변수로 PIN 을 넣어도 그 정적 파일이 그대로 나간다 —
   *  게이트가 통째로 우회된다. (2026-09-10 빌드 출력에서 실제로 `/r` 이
   *  `○ Static` 으로 찍혀서 발견했다)
   *
   *  레시피는 어차피 잠금 뒤에 있어야 하므로 정적 생성을 포기하는 게 맞다. */
  const jar = await cookies();

  if (!storePinConfigured()) {
    return (
      <StoreGate title={title}>
        <StorePinMissingBanner />
        {children}
      </StoreGate>
    );
  }

  if (!cookieMatches(jar.get(STORE_COOKIE)?.value)) {
    // ★ children 을 렌더하지 않는다. 이 갈래에서는 레시피가 어디에도 안 실린다
    return <StoreUnlockForm title={title} />;
  }

  return <>{children}</>;
}

/** 서버에 매장 PIN 이 없을 때 크게 알린다 */
function StorePinMissingBanner() {
  return (
    <div
      role="alert"
      className="mx-auto mt-4 w-full max-w-[720px] rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-3.5 dark:border-red-800 dark:bg-red-950/50"
    >
      <p className="text-[15px] font-bold text-red-800 dark:text-red-300">
        이 서버는 매장 번호가 설정되어 있지 않습니다
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-red-800/85 dark:text-red-300/85">
        <b>링크를 아는 사람은 누구나 레시피를 볼 수 있습니다.</b> 이 화면의
        번호 잠금은 눈으로 가리는 것일 뿐, 페이지 소스를 열면 내용이 그대로
        보입니다. 배포처(Vercel 등)의 환경변수에 <b>STORE_PIN</b>을 넣으면
        서버가 실제로 막습니다.
      </p>
    </div>
  );
}
