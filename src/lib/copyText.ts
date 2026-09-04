/* ------------------------------------------------------------------ *
 * 클립보드 복사.
 *
 * `navigator.clipboard`는 HTTPS 또는 localhost에서만 있다.
 * 매장 태블릿은 `http://192.168.x.x:3000` 으로 접속하므로 평문 HTTP다.
 * 거기서는 이 API가 아예 없어서:
 *   - `navigator.clipboard?.writeText()` 는 옵셔널 체이닝이 `.catch`까지
 *     건너뛰어 아무 반응이 없다
 *   - `navigator.clipboard.writeText()` 는 그 자리에서 TypeError로 죽는다
 *
 * 그래서 복사는 전부 이 함수를 거친다. 실패하면 창을 띄워 손으로 복사하게 한다.
 * 주방에서 버튼을 눌렀는데 아무 일도 안 일어나는 것이 제일 나쁘다.
 * ------------------------------------------------------------------ */

export type CopyResult = "copied" | "manual" | "failed";

export async function copyText(
  text: string,
  promptLabel = "아래 내용을 복사하세요",
): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    /* 권한 거부·비보안 출처 — 아래 폴백으로 간다 */
  }

  // 폴백 1: 화면 밖 textarea + execCommand. 구형·평문 HTTP에서도 대개 된다
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return "copied";
  } catch {
    /* 여기까지 실패하면 사람 손에 맡긴다 */
  }

  // 폴백 2: 창을 띄워 직접 복사하게 한다
  try {
    window.prompt(promptLabel, text);
    return "manual";
  } catch {
    return "failed";
  }
}
