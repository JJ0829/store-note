/* ------------------------------------------------------------------ *
 * 지표 이벤트 보내기.
 *
 * 왜 공통으로 빼는가 — 같은 `log()` 함수가 컴포넌트 4개에 복사돼 있었고
 * (`TrainingMode` `ChecklistView` `PrepView` `RecipeDetail`), 그중 **교육
 * 모드만 `sessionId`를 안 붙이고 있었다.** 그래서 `training_complete`와
 * `survey`를 이을 열쇠가 없었다 — 검증하려는 가설이 정확히 그 둘을 붙여
 * 보는 것인데도. → `01_MVP기획서` §8.4 #3
 *
 * 복사본이 늘어나면 이런 어긋남이 또 생긴다. `ui.tsx`와 `store.ts`를 만든
 * 것과 같은 이유로 한 곳에 둔다.
 *
 * ────────────────────────────────────────────────────────────────
 * ⚠️ 쌓는 곳이 둘이다 (2026-09-12). 환경변수가 있으면 **서버 DB**, 없으면
 *   로컬 파일(`data/events.jsonl`). **파일은 배포 환경에서 요청 사이에
 *   보존되지 않으므로, DB 가 없는 배포본은 한 줄도 안 쌓인다.**
 *   그래서 API는 `{ok:true, stored, sink}`로 사실을 말한다 —
 *   배포 점검에서 `sink` 가 `"db"` 인지 확인할 것.
 *   → `src/app/api/log/route.ts` · `db/migrations/0001_events.sql`
 * ------------------------------------------------------------------ */

const SID_KEY = "sop:sid";

/**
 * 이 기기를 구분하는 임의 값.
 *
 * 사람을 식별하지 않는다 — 기기 하나에 하나이고, 공용 태블릿이면 여러 사람이
 * 같은 값을 쓴다. 그래서 개인정보가 아니고, 백업 파일에도 안 담긴다
 * (`backup.ts`의 `buildBackup`은 담을 것을 하나씩 적어서 만든다).
 */
export function getSessionId(): string {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    // 사생활 보호 모드 등. 이벤트는 계속 보내되 기기 구분만 포기한다
    return "no-storage";
  }
}

/**
 * 이벤트 한 건.
 *
 * **실패해도 아무것도 하지 않는다.** 지표 수집이 화면을 막으면 안 된다 —
 * 신입이 교육받는 중에 로깅 때문에 멈추는 것이 지표를 잃는 것보다 나쁘다.
 *
 * `keepalive`를 켜는 이유: 마지막 항목을 체크하고 바로 화면을 닫는 일이
 * 흔하다. 없으면 그 요청이 중간에 끊긴다.
 */
export function logEvent(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sessionId: getSessionId(), ...payload }),
      keepalive: true,
    });
  } catch {
    /* 무시. 위 주석 참조 */
  }
}
