import Link from "next/link";
import { Caveat, Screen } from "@/components/ui";
import LoginForm from "@/components/LoginForm";
import { authConfigured } from "@/lib/serverSession";
import { getStore } from "@/lib/repo";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 로그인 화면.
 *
 * ★ 서버에 Supabase 설정이 없으면 **입력칸을 아예 안 그린다.**
 *   넣어봐야 안 되는 칸을 띄우면 사장님이 비밀번호를 의심하게 된다.
 *   («안 되는 이유» 를 화면이 먼저 말해야 한다 — 이 저장소의 규율이다)
 * ------------------------------------------------------------------ */
export default function LoginPage() {
  const store = getStore();

  if (!authConfigured()) {
    return (
      <Screen title="로그인" storeName={store.name}>
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[14px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <b>이 서버에는 로그인이 설정돼 있지 않습니다.</b>
          <p className="mt-2 text-[13px]">
            `SUPABASE_URL` 과 `SUPABASE_ANON_KEY` 가 없습니다. 앱은 지금처럼
            <b> 태블릿 안에 저장</b>하며 그대로 돌아갑니다.
          </p>
        </div>
        <Link href="/" className="mt-4 block text-center text-[13px] underline">
          첫 화면으로
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title="로그인" storeName={store.name}>
      <p className="mt-4 text-[13px] text-zinc-600 dark:text-zinc-400">
        로그인하면 매출·출퇴근 같은 기록을 <b>서버에 남길 수</b> 있습니다.
        로그인하지 않아도 앱은 지금처럼 돌아갑니다 — 다만 그 기록은
        <b> 이 태블릿 안에만</b> 남습니다.
      </p>

      <LoginForm />

      <div className="mt-6">
        <Caveat>
          계정은 매장마다 하나입니다. 계정이 없으면 만들 수 없습니다 —
          <b> 매장 등록은 운영자가 합니다.</b> 아무나 매장을 만들 수 있으면
          남의 매장 이름으로 계정을 팔 수 있기 때문입니다.
        </Caveat>
      </div>

      <Link href="/" className="mt-4 block text-center text-[13px] underline">
        첫 화면으로
      </Link>
    </Screen>
  );
}
