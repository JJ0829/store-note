/* ------------------------------------------------------------------ *
 * 데이터 모델 v2 (2026-08-31)
 *
 * 바뀐 이유는 docs/08_DECISION_LOG.md의 D-008, docs/day-flow.md 참조.
 * 핵심은 셋이다.
 *
 *  1) 화면이 셋(포지션·레시피·프렙)인데 단계(Step)는 똑같이 생겼다.
 *     → Step을 공통으로 빼고 컨테이너만 나눈다.
 *
 *  2) 주방 판단 기준은 대부분 "좋은 예 / 나쁜 예" 이분법이다.
 *     → imageUrl 하나 대신 goodImage / badImage.
 *
 *  3) 프렙에는 리드타임이 있다. 그리고 리드타임에는 세 종류가 있고,
 *     그중 "돈으로 되돌릴 수 없는 것"만이 이 제품의 진짜 존재 이유다.
 *     → recoverable 필드가 이 프로젝트에서 가장 중요한 한 칸이다.
 * ------------------------------------------------------------------ */

/** 모든 화면이 공유하는 단위. 한 장에 하나씩 보여준다. */
export type Step = {
  id: string;
  title: string;
  desc: string;
  /** 선배가 덧붙이는 한마디. 없으면 null */
  tip: string | null;
  /** 건너뛰면 안 되는 항목 (위생·안전) */
  critical: boolean;
  /** 이렇게 되면 맞다 */
  goodImage: string | null;
  /** 이러면 잘못된 것 — 기준이 안 맞는 항목일수록 이쪽이 중요하다 */
  badImage: string | null;
  /** 유튜브 '일부공개' 링크를 그대로 넣으면 된다 */
  videoUrl: string | null;
};

export type Section = {
  id: string;
  title: string;
  note: string | null;
  steps: Step[];
};

/* ------------------------------------------------------------------ */
/* 1. 포지션 — 체크리스트 / 교육 모드                                   */
/* ------------------------------------------------------------------ */

export type Position = {
  id: string;
  /** 공유 링크 주소: /p/{shareSlug}, /t/{shareSlug} */
  shareSlug: string;
  name: string;
  subtitle: string;
  summary: string;
  sections: Section[];
};

/* ------------------------------------------------------------------ */
/* 2. 레시피 — 배수 계산이 핵심                                         */
/* ------------------------------------------------------------------ */

export type Ingredient = {
  name: string;
  /** 배수 계산의 대상이 되는 수치. "적당히"는 여기 못 넣는다 */
  amount: number;
  /** g, ml, 개, 스쿱 */
  unit: string;
  note: string | null;
};

export type Recipe = {
  id: string;
  slug: string;
  name: string;
  /** 음료 / 베이커리 / 브런치 */
  category: string;
  /** 1배합이 몇 개 나오는지. "1배합=식빵 6개" → { amount: 6, unit: "개" } */
  yield: { amount: number; unit: string };
  ingredients: Ingredient[];
  /** 만드는 순서 */
  sections: Section[];
  /** 신입이 첫 주에 만드는 것인지 — 콘텐츠를 여기부터 채운다 */
  forNewbie: boolean;
};

/* ------------------------------------------------------------------ */
/* 3. 프렙 — 이 파일에서 가장 중요한 부분                               */
/* ------------------------------------------------------------------ */

/**
 * 리드타임의 종류. docs/day-flow.md에서 나온 구분이다.
 *
 *   time    시간이 흘러야 완성되는 것 (콜드브루, 반죽, 르방)
 *   order   주문해야 들어오는 것 (우유, 원두, 부자재)
 *   cycle   주기적으로 갈아줘야 하는 것 (정수 필터, 보건증)
 *   routine ★ 리드타임이 **없는** 것 — 그 시간대에 그냥 하는 일
 *
 * ★ routine 을 나중에 더한 이유 (2026-09-09)
 *   19:00~22:00 마감 준비 구간에 하는 일이 화면에 없었다(사장님 확인:
 *   재료 준비 · 홀 정리 · 화장실 청소). 그런데 이것들은 **걸어놓고 기다리는 일이
 *   아니다.** 앞의 셋 중 아무거나 붙이면 화면이 없는 리드타임을 계산하려 든다.
 *
 *   그래서 "리드타임 없음"을 거짓말 대신 이름으로 남긴다.
 *   `leadTimeHours` 와 `leadTimeDays` 가 둘 다 null 이어야 한다 (tests/seed.test.ts).
 */
export type LeadTimeKind = "time" | "order" | "cycle" | "routine";

/**
 * 이 업무가 언제 떠야 하는가.
 *
 * 전부 시간표에 매달면 안 된다. 추출 테스트처럼 "원두를 새로 깠을 때"
 * 발동하는 업무가 실제로 있다. 매일 띄우면 신입이 매일 하는 일로 잘못 배우고,
 * 빼면 원두 바뀐 날 아무도 안 한다.
 */
export type Trigger =
  /** 매일 정해진 시각 */
  | { type: "daily"; at: string }
  /** 특정 요일 (0=일 … 6=토). 금요일 발주가 여기 해당 */
  | { type: "weekday"; days: number[]; at: string }
  /** 조건이 생겼을 때. when은 사람이 읽는 문장 */
  | { type: "condition"; when: string }
  /** N일마다 (주기 관리) */
  | { type: "cycle"; everyDays: number };

export type PrepTask = {
  id: string;
  title: string;
  desc: string;
  kind: LeadTimeKind;
  trigger: Trigger;

  /** 걸어놓고 몇 시간 뒤에 쓸 수 있나 (kind: "time") */
  leadTimeHours: number | null;
  /** 주문하면 며칠 뒤 오나 (kind: "order") */
  leadTimeDays: number | null;

  /**
   * ★ 이 프로젝트에서 가장 중요한 한 칸.
   *
   * true  — 깜빡해도 쿠팡 등으로 메울 수 있다. 손해는 돈이다.
   * false — 어떤 방법으로도 못 되돌린다. 시간을 되돌려야 하니까.
   *
   * false인 항목만이 이 제품이 종이를 확실히 이기는 지점이다.
   * 전부 빨간 불로 띄우면 사람은 무시한다. 이 칸으로 경고 세기를 나눈다.
   */
  recoverable: boolean;

  /** 안 하면 무슨 일이 생기는지. 화면에 그대로 보여준다 */
  consequence: string;

  /** 매일 수량이 달라지는 항목인지 — 종이로 못 하는 이유 */
  quantityVaries: boolean;

  critical: boolean;
  goodImage: string | null;
  badImage: string | null;
  videoUrl: string | null;
  /** 이 프렙이 특정 레시피를 따라가야 하면 그 slug */
  recipeSlug: string | null;
};

export type PrepList = {
  id: string;
  slug: string;
  name: string;
  /** 언제 여는 목록인지 (예: 오후 프렙, 마감 전) */
  note: string | null;
  tasks: PrepTask[];
};

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 4. 근무 스케줄                                                       */
/*                                                                      */
/* 부가 기능이 아니다. 태블릿을 켰을 때 어떤 화면을 먼저 띄울지          */
/* 고르는 기준이다. 메뉴를 뒤지게 만들면 아무도 안 쓴다.                */
/* ------------------------------------------------------------------ */

export type ShiftFocus =
  /** 교육 모드 — 신입 첫날. 한 장씩 넘기며 보고, 진도는 남기지 않는다 */
  | { kind: "training"; slug: string; label: string }
  /** 체크리스트 — 매일 쓰는 것. 체크가 그날 날짜로 저장된다 */
  | { kind: "checklist"; slug: string; label: string }
  | { kind: "prep"; slug: string; label: string }
  | { kind: "recipes"; label: string };

export type Shift = {
  id: string;
  /** 제빵 / 오픈조 / 미들 / 마감조 */
  name: string;
  /** "05:00" */
  start: string;
  /** "13:00" */
  end: string;
  /** 이 시간대에 띄울 화면. 첫 번째가 대표 */
  focus: ShiftFocus[];
  note: string | null;
};

/* ------------------------------------------------------------------ */

export type Store = {
  id: string;
  name: string;
  slug: string;
};

export type SeedData = {
  store: Store;
  positions: Position[];
  recipes: Recipe[];
  prepLists: PrepList[];
  shifts: Shift[];
};
