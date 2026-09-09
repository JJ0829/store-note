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

  /**
   * 안 하면 무슨 일이 생기는지.
   *
   * ★ **리드타임 줄이 있으면 화면에 안 띄운다** (사장님 지적 2026-09-08:
   * *"안 하면 쿠팡으로 메울 수 있습니다 이딴 안 해도 될 말은 왜 하냐.
   * 그냥 만드는 데 드는 시간만, 지금 하면 몇 시부터 사용 가능한 시간만
   * 있어도 될 것 같은데"*).
   *
   * **맞는 지적이다.** `지금 걸면 → 내일 07:43 부터 사용 가능` 이 이미
   * "오늘 안 하면 내일 못 쓴다" 를 말한다. 그 밑에 한 줄을 더 붙이면
   * 같은 말을 두 번 하는 것이고, `쿠팡으로 메울 수 있습니다` 처럼
   * **안 해도 괜찮다고 알려주는 문장**은 오히려 해롭다.
   *
   * 그래서 이 문장은 **리드타임이 없는 항목에만** 남긴다 —
   * 주기 점검(정수 필터·보건증)과 마감 준비(홀 정리·화장실)가 그렇다.
   * 거기서는 이 문장 말고 그 일을 왜 하는지 설명할 방법이 없다.
   *
   * 빈 문자열이면 아무것도 안 그린다. `recoverable: false` 면 반드시 채워야
   * 한다 (`tests/seed.test.ts`) — 되돌릴 수 없는 것은 이유를 말해야 한다.
   */
  consequence: string;

  /** 매일 수량이 달라지는 항목인지 — 종이로 못 하는 이유 */
  quantityVaries: boolean;

  critical: boolean;
  goodImage: string | null;
  badImage: string | null;
  videoUrl: string | null;
  /** 이 프렙이 특정 레시피를 따라가야 하면 그 slug */
  recipeSlug: string | null;

  /**
   * ★ 다른 항목에 딸린 **추가 옵션**이면 그 부모 항목의 id (2026-09-09).
   *
   * 왜 생겼나 — 사장님 지적: *"르방이 쓰는 곳도 있고 안 쓰는 곳도 있는데
   * 꼭 저렇게 자리 차지 해야 하나. 그냥 내일용 반죽에 추가옵션으로 넣어 주세요."*
   *
   * **매장마다 하거나 안 하는 일이 있다.** 사워도우를 안 하는 카페에 르방은
   * 아무 뜻이 없는데, 목록의 한 칸을 온전히 차지하면 `9/10` 이 영영 안 채워진다.
   * 그러면 진행률이 거짓이 되고, 사람은 곧 진행률을 안 본다.
   *
   * 그래서 옵션은 **부모 카드 안**에 들어가고 **진행률에서 빠진다.**
   * 다만 `recoverable: false` 인 옵션은 **빨간 안내에는 그대로 센다** —
   * 르방을 쓰는 매장에서 "다 했습니다"가 거짓이 되면 안 되기 때문이다.
   * 두 숫자의 분모가 다른 것은 서로 다른 질문에 답하기 때문이다.
   *
   * 옵션의 옵션은 없다. 한 겹만이다 (tests/seed.test.ts 가 막는다).
   */
  optionOf: string | null;

  /**
   * ★ **매장에 따라 안 할 수도 있는가** (2026-09-09).
   *
   * `optionOf` 와 나눠 둔 이유 — 둘은 다른 것이다.
   *   `optionOf` : **어느 카드 안에 들어가는가** (배치)
   *   `optional` : **진행률 분모에 들어가는가** (셈)
   *
   * 바 부재료(청·냉침차·밀크티·시럽·크림폼)와 르방은 `optional: true` 다.
   * 안 파는 메뉴가 있으면 그건 이 매장 일이 아니라서 분모에서 빠져야 한다.
   *
   * 주기 점검(정수 필터·보건증…)은 묶여 있지만 `optional: false` 다.
   * **매장 관계없이 다 해야 하는 것**이고, 법정 항목도 섞여 있다.
   * 그래서 **묶음 머리 카드는 세지 않고 그 안의 항목을 센다** —
   * 부모까지 세면 같은 일을 두 번 세는 셈이 된다.
   */
  optional: boolean;
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
