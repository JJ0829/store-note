/* ------------------------------------------------------------------ *
 * 매장의 하루.
 *
 * ★ 달력의 하루와 매장의 하루는 다르다.
 *
 *   마감조는 평소 14:30~22:30 이지만, **01:00 퇴근이 특별한 경우로 실제 있다**
 *   (사장님 확인 2026-09-09). 그 사람에게 00:10 은 "오늘 새벽"이 아니라
 *   **"어제 마감 중"**이다. 그런데 저장 키를 달력
 *   날짜로 만들면 자정에 키가 바뀌어서, 23:50 에 찍어둔 체크 6개가
 *   00:10 에 화면을 다시 열었을 때 **전부 사라져 보인다.**
 *
 *   재현(2026-09-09): 23:50 → `sop:cafe-close:2026-09-09`
 *                     00:10 → `sop:cafe-close:2026-09-10`
 *
 *   이 프로젝트는 같은 문제를 출퇴근에서 이미 풀었다 —
 *   `attendance.workedMinutes()` 가 23:00→01:00 을 자정 넘김으로 계산해
 *   −22시간이 안 나오게 한다. 체크리스트·프렙만 자정을 그대로 맞고 있었다.
 *
 * 그래서 **새벽 4시를 하루의 경계**로 둔다 (사장님 결정 2026-09-09, 같은 날 5시→4시 조정).
 *   03:59 → 아직 어제
 *   04:00 → 오늘
 *
 * ★ 왜 5시가 아니라 4시인가 — 처음엔 5시로 잡았다가 옮겼다.
 *   **제빵조 출근이 정확히 05:00 이라 경계와 겹쳤다.** 04:50 에 도착해 화면을
 *   열면 "어제" 키를 쓰고, 05:00 을 넘겨 새로고침하면 그 사이 체크가 사라져
 *   보인다 — 마감조에서 고친 것과 똑같은 증상이 제빵조에서 재현됐다.
 *
 *   경계는 **아무도 없는 구간의 한가운데**여야 한다.
 *       01:00 마감조 퇴근 ────── 비어 있음 ────── 05:00 제빵조 출근
 *   04:00 이면 마감조에 3시간(마감이 늦어져도 여유), 제빵조에 1시간이 남는다.
 *
 * → docs/deliverables/19_정책정의서.md §3.2 · §8 #1
 *
 * ⚠️ 여기서 다루는 것은 **체크 상태 키**뿐이다.
 *   매출 화면의 날짜 피커는 달력 날짜가 맞고(사람이 고르는 날짜다),
 *   출퇴근은 이미 자체적으로 자정을 처리한다. 발주는 §8 #2 로 남겨뒀다.
 * ------------------------------------------------------------------ */

/** 하루의 경계. 이 시각 전이면 아직 어제다 */
export const DAY_START_HOUR = 4;

function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 지금이 속한 **영업일**. `YYYY-MM-DD`.
 *
 * `setDate(-1)` 은 월초·연초·윤년을 알아서 넘긴다 (JS Date 표준 동작).
 */
export function businessDay(now: Date = new Date()): string {
  const d = new Date(now.getTime());
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return ymd(d);
}

/** 체크 상태 저장 키. `prep:afternoon:2026-09-09` 꼴 */
export function dayKey(prefix: string, day: string = businessDay()): string {
  return `${prefix}${day}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 지난 영업일의 체크 키를 지운다.
 *
 * ★ 왜 지우는가 — 화면이 이용자에게 **"날짜가 바뀌면 초기화됩니다"라고
 *   계속 약속해 왔다.** 그런데 코드는 새 키를 읽을 뿐 옛 키를 안 지워서
 *   매일 하나씩 무기한 쌓였다(`PrepView` 에는 `removeItem` 이 0건이었다).
 *   약속을 지키는 쪽으로 맞춘다.
 *
 * 체크 상태는 **법정 보존 대상이 아니다.** 출퇴근·근로계약과 다르다
 * (그쪽은 근로기준법 제42조 3년이고 이 함수가 건드리지 않는다).
 *
 * @param prefix  `"prep:afternoon:"` 처럼 **콜론까지** 포함한 접두사.
 *                다른 키(`sop:roster` 등)를 건드리지 않으려면 슬러그가 들어가야 한다.
 * @param keep    남길 영업일. 보통 오늘.
 * @returns 지운 키 목록 (테스트·디버깅용)
 */
export function pruneDayKeys(prefix: string, keep: string): string[] {
  const doomed: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const tail = k.slice(prefix.length);
      // 날짜만 붙은 키여야 한다. `prep:afternoon:메모` 같은 건 건드리지 않는다
      if (!DAY_RE.test(tail)) continue;
      if (tail !== keep) doomed.push(k);
    }
    // 순회 중에 지우면 인덱스가 밀린다. 모아서 지운다
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    /* 사생활 보호 모드·용량 초과. 화면은 계속 돌아야 한다 */
  }
  return doomed;
}

/**
 * `day` 직전 `n` 개 영업일. 최신순.
 *
 * 발주 화면이 "지난 7일 중 주문만 하고 안 들어온 것"을 찾을 때 쓴다.
 * `new Date()` 에서 빼면 자정 직후에 창이 하루 밀린다 — 기준을 영업일
 * 문자열로 잡고 거기서 뺀다.
 *
 * 정오를 기준 시각으로 쓴다. 자정으로 잡으면 서머타임이 있는 지역에서
 * 하루가 밀릴 수 있다 (한국은 없지만 규칙을 안전하게 둔다).
 */
export function recentDays(day: string, n: number): string[] {
  const base = new Date(`${day}T12:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}
