/* ===========================================================================
 *  시연 데이터 — 백업 파일 모양으로 만든다 (2026-09-14)
 *
 *  ★ 왜 이 파일이 있나
 *    직원·근무표·출퇴근·시급·매출·거래처 단가·판매가·고정비·점검 기록은
 *    전부 **브라우저(localStorage)** 에 산다. 시드(`data/seed.json`)에는
 *    넣을 자리가 없다. 그래서 시연 기기를 새로 켜면 그 화면들이 전부 비어
 *    있고, 발표에서 「원가율 · 인건비 · 하루 순익」 을 보여줄 수가 없다.
 *
 *    이 스크립트가 만든 `public/demo-backup.json` 을 `/backup` 화면의
 *    「시연 데이터 넣기」 가 읽어서 **되돌리기와 같은 길**(checkRestore →
 *    확인 → applyRestore)로 넣는다. 새 저장 경로를 만들지 않는다 — 되돌리기는
 *    이미 테스트로 못 박힌 길이다.
 *
 *  ★ 전부 가짜다. 실명·전화·이메일은 없다. 매장·거래처 이름은 시드와 같은
 *    ○○ / △△ 자리표시 꼴이다. 숫자는 「그럴듯하게」 잡은 값이고 어떤 매장의
 *    실제 값도 아니다 — 심사위원이 물으면 그렇게 답한다.
 *
 *  ★ 재료 이름은 시드 레시피의 `ingredients[].name` 과 **글자까지 같아야**
 *    원가가 잡힌다 (`vendors.findItemByName` 은 trim 뒤 완전일치).
 *    tests/demoBackup.test.ts 가 레시피 10개 전부 missing === 0 인지 본다.
 *
 *  실행:  node db/demo.js            → public/demo-backup.json 을 다시 쓴다
 *         node db/demo.js --check    → 파일이 지금 스크립트 결과와 같은지만 본다
 *         node db/demo.js --print    → 표준출력으로 (테스트가 쓴다)
 * ======================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 기준일. 고정해 두어야 결과가 결정적이고 테스트가 비교할 수 있다 */
export const BASE_DAY = "2026-09-14"; // 월요일
const OUT = path.join(process.cwd(), "public", "demo-backup.json");

/* ------------------------------------------------------------------ */
/* 날짜 도우미                                                          */
/* ------------------------------------------------------------------ */

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + n);
  return t;
}
function dayOf(day, n) {
  return ymd(addDays(day, n));
}
function weekday(day) {
  return addDays(day, 0).getDay(); // 0 일 … 6 토
}
function hm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function toMin(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/* ------------------------------------------------------------------ */
/* 사람 · 근무조                                                        */
/* ------------------------------------------------------------------ */

/** 시드의 근무조 (기본값). 이름이 근무표 배정값이다 */
const SHIFTS = {
  제빵: { start: "05:00", end: "13:00" },
  오픈조: { start: "07:30", end: "15:30" },
  마감조: { start: "14:30", end: "22:30" },
};

/**
 * 직원 4명 — 전부 가짜 이름, 연락처 없음.
 * workDays 는 계약서의 요일(0 일 … 6 토)이고 근무표 배정도 이걸로 만든다.
 */
/**
 * ★ 서버 표(`staff`·`punches`·`contracts`)의 id 는 **uuid** 다 (2026-09-16).
 *   전에는 `s-demo-1`·`pu-demo-7` 꼴이었는데, 서버가 그 모양을 거절해서
 *   시연 데이터가 **브라우저에만 남고 서버로는 한 건도 안 올라갔다.**
 *   결과가 결정적이어야 하므로(테스트가 파일과 비교한다) 난수 대신
 *   자리에 번호를 박은 uuid 를 만든다. 첫 마디가 종류다 — aa 직원 · bb 출퇴근 · cc 계약.
 *   거래처(`v-demo-*`)는 서버로 안 가므로 그대로 둔다.
 */
const demoId = (kind, n) =>
  `${kind.repeat(4)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const STAFF = [
  { id: demoId("aa", 1), section: "제빵", name: "김하늘", shift: "제빵", wage: 11_500, workDays: [1, 2, 3, 4, 5], start: "2026-03-02", insured: true },
  { id: demoId("aa", 2), section: "바", name: "이서준", shift: "오픈조", wage: 10_500, workDays: [1, 2, 3, 4, 5], start: "2026-05-11", insured: true },
  { id: demoId("aa", 3), section: "홀", name: "박지우", shift: "마감조", wage: 10_320, workDays: [2, 3, 4, 5, 6], start: "2026-07-01", insured: false },
  { id: demoId("aa", 4), section: "바", name: "최민준", shift: "마감조", wage: 10_800, workDays: [0, 1, 3, 5, 6], start: "2026-08-18", insured: false },
];

/* ------------------------------------------------------------------ */
/* 만들기                                                              */
/* ------------------------------------------------------------------ */

export function buildDemo(base = BASE_DAY) {
  // 지난주 월 ~ 이번 주 일 (2주치 근무표)
  const rosterDays = [];
  for (let i = -7; i <= 6; i++) rosterDays.push(dayOf(base, i));

  /* ---------- 근무표 ---------- */
  const staff = STAFF.map((s) => ({
    id: s.id,
    section: s.section,
    name: s.name,
    email: "",
    phone: "",
  }));
  const assign = {};
  for (const s of STAFF) {
    assign[s.id] = {};
    for (const day of rosterDays) {
      assign[s.id][day] = s.workDays.includes(weekday(day)) ? s.shift : "";
    }
  }

  /* ---------- 출퇴근 ----------
   *  지난주(−7 … −1)는 전부 완결. 오늘(0)은 제빵은 퇴근까지, 오픈조는 출근만
   *  (홈 화면에 「● 근무 중」 이 한 장은 떠야 한다). 마감조는 아직 안 왔다.
   *  시각의 흔들림은 결정적으로 — 사람·날짜로 정해지는 작은 편차. */
  const punches = {};
  let punchSeq = 0;
  const wobble = (a, b) => ((a * 7 + b * 13) % 11) - 5; // −5 … +5 분
  STAFF.forEach((s, si) => {
    punches[s.id] = {};
    const sh = SHIFTS[s.shift];
    for (let i = -7; i <= 0; i++) {
      const day = dayOf(base, i);
      if (!assign[s.id][day]) continue;
      const late = si === 2 && i === -4 ? 14 : 0; // 박지우가 한 번은 지각
      const inAt = hm(toMin(sh.start) + wobble(si, i) + late);
      let outAt = hm(toMin(sh.end) + Math.abs(wobble(i, si)) + 5);
      if (i === 0) {
        if (s.shift === "오픈조") outAt = ""; // 지금 일하는 중
        else if (s.shift === "마감조") continue; // 아직 출근 전
      }
      punchSeq += 1;
      punches[s.id][day] = {
        id: demoId("bb", punchSeq),
        staffId: s.id,
        date: day,
        inAt,
        outAt,
        breakMin: 30,
        note: late ? "버스 지연" : "",
      };
    }
  });

  /* ---------- 근로계약 ---------- */
  const contracts = STAFF.map((s, i) => {
    const sh = SHIFTS[s.shift];
    return {
      id: demoId("cc", i + 1),
      staffId: s.id,
      startDate: s.start,
      endDate: "",
      hourlyWage: s.wage,
      weeklyHours: 40,
      workDays: s.workDays,
      startTime: sh.start,
      endTime: sh.end,
      handedOver: true,
      insured: s.insured,
      note: "",
    };
  });

  /* ---------- 주기 점검 ----------
   *  「마지막으로 한 날」 + 「매장이 정한 주기」. 섞어 둔다 —
   *  기한 지난 것(정수 필터), 오늘까지인 것(배수구), 여유 있는 것,
   *  그리고 **기록이 아예 없는 것 하나**(그라인더 날) — 화면이 그걸
   *  「지금 해야 할 것」 에 세는지 보여주기 위해. */
  const cycleDone = {
    "c-1": "2026-05-11", // 정수 필터 — 120일 주기 → 9/8 지났음
    "c-2": "2026-08-05",
    "c-3": "2026-09-01", // 제빙기 — 30일
    "c-4": "2026-03-02", // 보건증 — 1년
    "c-5": "2026-09-13",
    "c-6": "2026-09-07", // 배수구 — 7일 → 오늘까지
    "c-7": "2026-06-01",
    "c-9": "2026-06-20", // 후드·덕트 — 180일
    "c-10": "2026-04-15", // 소화기 — 180일 → 10/12
    "c-11": "2026-02-10", // 위생교육 — 1년
    "c-12": "2026-08-20",
    "c-13": "2026-07-01",
    // c-8 그라인더 날 마모 — 기록 없음 (일부러)
  };
  const cycleEvery = {
    "c-1": 120, "c-2": 90, "c-3": 30, "c-4": 365, "c-5": 7, "c-6": 7,
    "c-7": 180, "c-8": 180, "c-9": 180, "c-10": 180, "c-11": 365, "c-12": 30, "c-13": 365,
  };

  /* ---------- 매출 (9/1 ~ 어제) ----------
   *  요일로 정한 값. 주말이 높고, 재료비는 매출의 29~32% 근처. */
  const byWeekday = { 0: 590_000, 1: 410_000, 2: 395_000, 3: 430_000, 4: 445_000, 5: 520_000, 6: 640_000 };
  const sales = {};
  for (let day = "2026-09-01"; day < base; day = dayOf(day, 1)) {
    const w = weekday(day);
    const dd = Number(day.slice(-2));
    const total = byWeekday[w] + ((dd * 37) % 9) * 1_000 - 4_000;
    const count = Math.round(total / 4_300) + ((dd * 3) % 5) - 2;
    const rate = 0.29 + ((dd * 11) % 4) * 0.01; // 0.29 … 0.32
    sales[day] = {
      date: day,
      total,
      count,
      material: Math.round((total * rate) / 100) * 100,
      note: day === "2026-09-12" ? "단체 12명 (예약)" : "",
    };
  }

  /* ---------- 거래처 · 단가 ----------
   *  ★ 품목 이름은 시드 레시피의 재료 이름과 글자까지 같다. */
  const vendors = [
    { id: "v-demo-roast", name: "△△ 로스터리", phone: "", contact: "", how: "카톡", cutoff: "12:00", deliverDays: [1, 2, 3, 4, 5], leadDays: 2, note: "원두 5kg 이상이면 배송비 없음" },
    { id: "v-demo-food", name: "□□ 식자재", phone: "", contact: "", how: "전화", cutoff: "15:00", deliverDays: [1, 2, 3, 4, 5], leadDays: 1, note: "금요일에 주말치까지 주문" },
    { id: "v-demo-bake", name: "◇◇ 베이킹몰", phone: "", contact: "", how: "온라인", cutoff: "14:00", deliverDays: [1, 2, 3, 4, 5], leadDays: 2, note: "" },
  ];
  const item = (vendorId, name, packAmount, packUnit, packPrice, note = "") => ({
    id: `vi-demo-${name.replace(/[^가-힣a-zA-Z0-9]/g, "")}`,
    vendorId, name, packAmount, packUnit, packPrice, note,
  });
  const items = [
    item("v-demo-roast", "원두 (도징)", 1000, "g", 32_000, "에스프레소 블렌드 1kg"),
    item("v-demo-roast", "원두 (굵게 분쇄)", 1000, "g", 30_000, "콜드브루용"),
    item("v-demo-food", "우유", 1000, "ml", 2_900),
    item("v-demo-food", "생크림", 1000, "ml", 7_800),
    item("v-demo-food", "과일 과육", 1000, "g", 9_000, "냉동 딸기 기준"),
    item("v-demo-food", "레몬즙", 1000, "ml", 8_500),
    item("v-demo-bake", "강력분", 20000, "g", 38_000, "20kg 한 포"),
    item("v-demo-bake", "설탕", 15000, "g", 21_000, "15kg 한 포"),
    item("v-demo-bake", "소금", 1000, "g", 1_500),
    item("v-demo-bake", "이스트", 500, "g", 6_500, "인스턴트 드라이"),
    item("v-demo-bake", "버터", 1000, "g", 14_000),
    item("v-demo-bake", "찻잎", 100, "g", 12_000, "얼그레이"),
    item("v-demo-bake", "홍차잎", 500, "g", 28_000, "밀크티용 아쌈"),
    item("v-demo-bake", "바닐라 시럽", 1000, "ml", 12_000),
  ];

  /* ---------- 설정 ----------
   *  excluded: 사는 재료가 아닌 것. 「추출량」 을 세면 원두가 두 번 계산된다
   *  (CLAUDE.md). 「기존 르방」 은 우리가 키운 것이라 단가가 없다. */
  const settings = {
    minWage: 10_320,
    fiveOrMore: false,
    targetCostRate: 30,
    prices: {
      "rec-americano": 4_500,
      "rec-latte": 5_000,
      "rec-shokupan": 4_800,
    },
    excluded: ["물", "정수", "추출량", "기존 르방"],
    monthlyFixed: 4_200_000,
    openDaysPerMonth: 26,
  };

  /* ---------- 발주 기록 ----------
   *  p-5 우유·식자재 (평일 15:00) / p-6 원두 (재고 따라). 오늘 것은 주문만. */
  const orderLog = {};
  for (let i = -7; i <= 0; i++) {
    const day = dayOf(base, i);
    const w = weekday(day);
    if (w === 0 || w === 6) continue;
    orderLog[day] = {
      "p-5": {
        ordered: true,
        received: i !== 0,
        memo: w === 5 ? "우유 24팩 · 생크림 4 (주말치)" : "우유 12팩 · 생크림 2",
      },
    };
    if (i === -4) orderLog[day]["p-6"] = { ordered: true, received: true, memo: "원두 5kg" };
  }
  const orderLinks = { "p-5": "v-demo-food", "p-6": "v-demo-roast" };

  return {
    kind: "store-note-backup",
    version: 3,
    exportedAt: `${base}T09:00:00.000Z`,
    storeName: "○○ 베이커리 카페",
    roster: { staff, assign },
    punches,
    contracts,
    cycleDone,
    cycleEvery,
    sales,
    vendors: { vendors, items },
    settings,
    recipes: [],
    orderLog,
    orderLinks,
  };
}

/* ------------------------------------------------------------------ */
/* 명령줄                                                              */
/* ------------------------------------------------------------------ */

const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const text = JSON.stringify(buildDemo(), null, 2) + "\n";
  if (process.argv.includes("--print")) {
    process.stdout.write(text);
  } else if (process.argv.includes("--check")) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
    if (cur !== text) {
      console.error("public/demo-backup.json 이 db/demo.js 결과와 다르다. `node db/demo.js` 로 다시 만들 것.");
      process.exit(1);
    }
    console.log("demo-backup.json — 스크립트와 같다");
  } else {
    fs.writeFileSync(OUT, text, "utf-8");
    const b = JSON.parse(text);
    console.log(
      `public/demo-backup.json — 직원 ${b.roster.staff.length} · 출퇴근 ${Object.values(b.punches).reduce((n, d) => n + Object.keys(d).length, 0)}건 · 매출 ${Object.keys(b.sales).length}일 · 품목 ${b.vendors.items.length}`,
    );
  }
}
