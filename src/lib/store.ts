/* ------------------------------------------------------------------ *
 * localStorage 읽고 쓰기.
 *
 * 새로 붙는 화면(원가·근태·매출·거래처·계약서)이 전부 같은 방식으로
 * 저장한다. 화면마다 try/catch를 복사하면 한 군데서만 빼먹어도
 * 그 화면만 조용히 죽는다 — 사생활 보호 모드나 저장공간이 꽉 찬
 * 태블릿에서 localStorage 접근은 예외를 던진다.
 *
 * 서버 DB(Supabase)로 옮길 때 손댈 곳을 여기 하나로 모아두는 뜻도 있다.
 * ------------------------------------------------------------------ */

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    // null·문자열이 들어와도 화면이 안 죽게 최소한만 본다
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 새 항목 id. 한 태블릿 안에서만 구분되면 된다 */
export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/* 돈 표기                                                              */
/* ------------------------------------------------------------------ */

/**
 * 원 단위 표기. 1원 미만은 버린다.
 *
 * 원가는 소수가 나온다(아메리카노 원두 18g에 원두가 kg당 28,000원이면
 * 504원). 화면에 504.0000000001원이 뜨면 바로 못 믿는 숫자가 된다.
 */
export function won(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return Math.round(v).toLocaleString("ko-KR");
}

/** 소수 첫째 자리까지의 퍼센트. 원가율·인건비율에 쓴다 */
export function pct(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0)
    return "-";
  return (Math.round((part / whole) * 1000) / 10).toFixed(1);
}

/* ------------------------------------------------------------------ */
/* 한글 조사                                                            */
/* ------------------------------------------------------------------ */

/**
 * 마지막 글자에 받침이 있는지.
 *
 * 한글 음절은 0xAC00부터 28개 종성 단위로 배열돼 있어서
 * `(코드 - 0xAC00) % 28`이 0이면 받침이 없다.
 */
function jongseong(word: string): number | null {
  const s = word.trim();
  if (!s) return null;
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return null; // 한글이 아니면 모른다
  return (code - 0xac00) % 28;
}

/**
 * "로 / 으로"를 골라 붙인다.
 *
 * `${v.how}으로 보내세요`라고 박아두면 "전화으로 보내세요"가 된다.
 * 거래처 주문 방법이 전화·카톡·앱·홈페이지·방문으로 섞여 있어서
 * 어느 쪽으로 박아도 절반은 틀린다. 받침 ㄹ은 "로"를 쓴다(방문으로/서울로).
 */
export function ro(word: string): string {
  const j = jongseong(word);
  if (j === null) return `${word}로`; // 영문·숫자는 그냥 '로'
  return j === 0 || j === 8 ? `${word}로` : `${word}으로`;
}

/** "은 / 는" */
export function eun(word: string): string {
  const j = jongseong(word);
  if (j === null) return `${word}는`;
  return j === 0 ? `${word}는` : `${word}은`;
}

/** "을 / 를" */
export function eul(word: string): string {
  const j = jongseong(word);
  if (j === null) return `${word}를`;
  return j === 0 ? `${word}를` : `${word}을`;
}

/** "과 / 와" */
export function gwa(word: string): string {
  const j = jongseong(word);
  if (j === null) return `${word}와`;
  return j === 0 ? `${word}와` : `${word}과`;
}
