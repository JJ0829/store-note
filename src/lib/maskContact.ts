/* ------------------------------------------------------------------ *
 * 연락처 가리기 — 공용 태블릿이라 기본으로 가린다.
 *
 * ★ 가리는 목적은 «주소·번호를 통째로 베껴가지 못하게» 다.
 *   **«누구 것인지 못 알아보게» 가 아니다.**
 *
 *   예전에는 둘 다 같은 함수로 가려서 `wfjeongho@gmail.com` 이
 *   `wf•••••••••••om` 이 됐다. 사장님 지적 (2026-09-15):
 *   *"이메일 @ 뒤에 나와도 상관 없을꺼 같은데 / 전화번호는 010-****-0000 이렇게 해"*
 *
 *   맞는 말이다. 도메인은 gmail·naver·daum 정도라 가려도 지켜지는 것이 없고,
 *   매장에서 사람을 가리는 것은 **전화 뒤 4자리**다. 알아볼 수 없게 가리면
 *   화면이 그냥 읽을 수 없는 점 덩어리가 된다.
 *
 * ★ `.ts` 에 두는 이유 — 테스트가 `.tsx` 를 못 불러온다(노드 테스트 러너가
 *   JSX 를 안 벗긴다). 순수 계산은 `src/lib` 에 둔다는 이 저장소 규율과도 같다.
 * ------------------------------------------------------------------ */

/** 모양을 모르는 값. 앞뒤 두 글자만 남긴다 */
export function maskPlain(v: string): string {
  const t = v.trim();
  if (t.length <= 4) return "•".repeat(t.length);
  return t.slice(0, 2) + "•".repeat(Math.max(3, t.length - 4)) + t.slice(-2);
}

/**
 * 이메일 — **`@` 뒤는 그대로 보여준다.**
 *
 * `wfjeongho@gmail.com` → `wf•••••••@gmail.com`
 */
export function maskEmail(v: string): string {
  const t = v.trim();
  const at = t.indexOf("@");
  if (at <= 0) return maskPlain(t); // 메일 모양이 아니면 예전 방식
  const local = t.slice(0, at);
  const keep = local.slice(0, Math.min(2, local.length));
  return keep + "•".repeat(Math.max(3, local.length - keep.length)) + t.slice(at);
}

/**
 * 전화번호 — `010-****-5678`.
 *
 * ★ 서울은 지역번호가 **두 자리**다. 무조건 3으로 자르면 `02-123-4567` 이
 *   `021-***-4567` 이 되어 **없는 번호처럼 보인다.**
 */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length < 7) return maskPlain(v); // 모양을 모르면 예전 방식
  const head = d.startsWith("02") ? 2 : 3;
  const mid = Math.max(3, d.length - head - 4);
  return `${d.slice(0, head)}-${"*".repeat(mid)}-${d.slice(-4)}`;
}
