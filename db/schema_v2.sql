-- ============================================================================
--  매장수첩 스키마 v2
--  PostgreSQL 15+ / Supabase
--  2026-09-11
--
--  v1 에 대한 심사 지적 5건 + 2차 피드백 2건을 전부 반영한 버전이다.
--
--    1. 매장 간 데이터가 이어지는 문제   → 전 참조를 복합 외래키 (id, store_id) 로
--    2. 원가 이력이 매입가에만 있는 문제 → 규격 전체를 기간 이력으로 + 레시피 버전
--    3. 계획과 실행이 안 이어지는 문제   → 날짜 3분화 + 실행행이 계획을 가리킨다
--    4. RLS 가 없는 문제                 → 전 테이블 RLS. 매장은 세션에서만 나온다
--    5. 추천 근거가 안 남는 문제         → 실행 기록 + 입력 스냅샷 + 사람이 읽는 이유
--
--  그리고 v1 에 없던 것 두 가지를 더 넣었다. 둘 다 이 제품에서 실제로 사람을
--  다치게 하는 지점이라 DB 가 막아야 한다.
--
--    A. 재료를 이름 문자열로 잇지 않는다  → items 가 재료 마스터가 된다
--    B. g 과 ml 을 절대 안 바꾼다          → 단위 계열을 외래키로 강제한다
--
--  2026-09-11 2차 피드백 (심사)
--    C. 같은 매장인지는 보지만 **같은 대상인지**는 안 보던 관계 6곳
--       → (번호, 매장, **대상**) 세 칸 외래키로 바꿨다
--       · 판매 ↔ 메뉴 레시피판     · 입고 ↔ 발주 계획 · 품목 규격
--       · 제조 ↔ 제조 계획 · 레시피 · 추천 ↔ 그때 규격
--    D. 단위 계열 검증이 빠진 곳 3곳
--       → item_versions.pack_family · make_recipe_versions.yield_family
--         · baked_lines.unit_family(칸 자체가 없었다)
--
--  2026-09-11 추가 (지적은 아니지만 같은 이유로 막았다)
--    E. 추천의 "계산 단계" 가 안 남았다 → demand_avg · stockout_days_excluded
--       · weekday_adjust · round_unit 을 스냅샷에 넣었다.
--    F. 품절을 기록할 곳이 없었다 → stock_counts.was_stockout.
--       품절난 날의 판매량은 수요가 아니라 재고 한계다. 그걸 평균에 넣으면
--       추천이 계속 모자라고 → 또 품절나고 → 평균이 더 내려간다.
--
--  ⚠ 실행 순서대로 쓰여 있다. 위에서부터 그대로 돌린다.
--  ⚠ 운영 DB 에 바로 돌리지 말 것. Supabase 브랜치에서 먼저 돌린다.
-- ============================================================================

create extension if not exists btree_gist;   -- 기간 겹침 방지 (EXCLUDE) 에 필요


-- ============================================================================
--  0. 단위 — g 과 ml 을 섞지 못하게 하는 뿌리
-- ============================================================================
--
--  ★ 이 앱에서 가장 조용하게 틀리는 계산이 단위 환산이다.
--    밀가루는 0.55, 우유는 1.03 이라 g 과 ml 은 밀도를 모르면 못 바꾼다.
--    바꾸면 원가가 틀리는데 사람이 못 알아챈다.
--
--    그래서 계열(weight / volume / count)을 데이터로 두고,
--    아래에서 복합 외래키로 "레시피 줄의 단위 계열 = 품목 기준단위 계열" 을 강제한다.
--    애플리케이션 검사가 아니라 DB 제약이다.

create table units (
  code    text primary key,                    -- g · kg · ml · L · 개
  family  text not null
          check (family in ('weight','volume','count')),
  to_base numeric(20,8) not null,              -- 계열 기준단위로의 배수
  constraint uq_units_code_family unique (code, family)   -- ★ 복합 FK 대상
);

insert into units (code, family, to_base) values
  ('g',  'weight', 1),
  ('kg', 'weight', 1000),
  ('ml', 'volume', 1),
  ('L',  'volume', 1000),
  ('개', 'count',  1),
  ('ea', 'count',  1);


-- ============================================================================
--  1. 매장 · 사용자
-- ============================================================================

create table stores (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  slug   text not null unique,
  timezone text not null default 'Asia/Seoul',

  -- ★ 매장의 하루는 자정이 아니라 새벽에 바뀐다.
  --   마감조가 특별한 경우 01:00 까지 일한다. 달력 날짜로 집계하면
  --   23:50 의 판매와 00:10 의 판매가 다른 날로 갈린다.
  business_day_start time not null default '04:00',

  created_at timestamptz not null default now()
);

create table users (
  id       uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references stores(id),
  name     text not null,
  role     text not null default 'staff'
           check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now()
);
create index ix_users_store on users(store_id);

-- 영업일 계산. 모든 원장 테이블이 이 함수를 쓴다.
create or replace function business_date(p_store uuid, p_at timestamptz)
returns date
language sql stable as $fn$
  select (p_at at time zone s.timezone
          - (s.business_day_start - time '00:00'))::date
    from stores s where s.id = p_store
$fn$;


-- ============================================================================
--  2. 거래처
-- ============================================================================

create table suppliers (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name     text not null,
  phone    text,
  contact  text,
  order_method text,                    -- 전화 · 카톡 · 앱 · 홈페이지

  -- 이 시각을 넘겨 주문하면 주문일이 하루 밀린다
  cutoff_time  time,
  -- 배송 요일 (0=일 … 6=토). 비어 있으면 매일.
  -- 금요일에 주말치까지 몰아 주문하는 이유가 여기 있다 — 일요일 배송이 거의 없다.
  delivery_days smallint[] not null default '{}',
  lead_days     int not null default 1,

  memo      text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint uq_suppliers_id_store unique (id, store_id),   -- ★ 복합 FK 대상
  constraint uq_suppliers_name     unique (store_id, name)
);


-- ============================================================================
--  3. 품목 — 재료 마스터. v1 의 "이름으로 잇기" 를 여기서 끝낸다
-- ============================================================================
--
--  ★ v1 은 레시피의 재료 이름과 거래처 품목 이름을 문자열로 맞췄다.
--    "우유" 와 "흰우유" 가 다르면 그 재료가 원가에서 조용히 빠진다.
--    v2 에서는 품목이 하나의 실체(마스터)이고 레시피는 그 id 를 가리킨다.
--    이름으로 맞추는 코드가 아예 없어진다.

create table items (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  supplier_id uuid,

  name     text not null,
  category text,

  -- purchased: 사 오는 것 / made: 매장에서 만드는 부재료 (르방·청·시럽·크림폼)
  kind text not null default 'purchased'
       check (kind in ('purchased','made')),

  -- 재고·레시피·원가가 전부 이 단위로 환산돼 계산된다
  base_unit   text not null references units(code),
  base_family text not null,

  is_active  boolean not null default true,
  created_at timestamptz not null default now(),

  constraint uq_items_id_store unique (id, store_id),
  constraint uq_items_name     unique (store_id, name),

  -- ★ 지적 1 — 다른 매장 거래처를 못 붙인다
  constraint fk_items_supplier_same_store
    foreign key (supplier_id, store_id) references suppliers (id, store_id),

  -- ★ base_unit 과 base_family 가 실제로 짝인지 DB 가 확인한다
  constraint fk_items_unit_family
    foreign key (base_unit, base_family) references units (code, family),

  -- ★ 레시피 줄이 계열까지 맞추도록 참조할 키
  constraint uq_items_id_store_family unique (id, store_id, base_family)
);

create index ix_items_store on items(store_id);


-- ============================================================================
--  4. 품목 규격 이력 — 지적 2
-- ============================================================================
--
--  ★ v1 은 item_prices 로 매입가만 이력화했다. 그런데 과거 원가를 흔드는 값은
--    가격만이 아니다. 팩 용량(per_unit)이 1000ml → 900ml 로 줄거나,
--    1배합 산출 개수(yield_count)가 바뀌거나, 면세가 과세로 바뀌면
--    "3월 원가" 를 다시 뽑았을 때 3월 가격 × 지금 규격이 섞인 숫자가 나온다.
--    그리고 틀렸다는 표시가 아무 데도 안 뜬다.
--
--    그래서 원가에 들어가는 값을 한 버전 행에 통째로 담는다.

create table item_versions (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  item_id  uuid not null,

  unit_cost   numeric(14,4) not null,        -- 한 팩 값 (원)
  per_unit    numeric(14,4) not null,        -- 그 팩의 수량 (1000)
  pack_unit   text not null references units(code),   -- 그 수량의 단위 (ml)
  pack_family text not null,

  yield_count numeric(14,4),                 -- made 품목의 1배합 산출 개수
  is_tax_free boolean not null default false,
  tax_rate    numeric(6,4) not null default 0.10,

  -- 적용 구간. 끝이 null 이면 현재 유효.
  -- ★ from/to 두 칸으로 두면 구간이 겹쳐도 DB 가 못 막고,
  --   그러면 조회문이 어느 값을 쓸지 마음대로 고른다.
  validity  daterange not null default daterange(current_date, null, '[)'),

  note       text,
  created_at timestamptz not null default now(),
  created_by uuid,

  constraint uq_item_versions_id_store unique (id, store_id),
  -- ★ 2차 피드백 1 — 이 규격이 "어느 품목의 것인지" 까지 잠근다.
  --   입고·추천이 (규격, 매장, 품목) 세 칸으로 가리킬 수 있게 하는 열쇠다.
  constraint uq_item_versions_id_store_item unique (id, store_id, item_id),
  constraint fk_item_versions_unit_family
    foreign key (pack_unit, pack_family) references units (code, family),
  -- ★ 2차 피드백 2 — 규격의 단위 계열이 품목 기준 계열과 같아야 한다.
  --   이게 없으면 무게 품목(밀가루)에 1,000ml 규격을 등록할 수 있었다.
  constraint fk_item_versions_item_same_store_and_family
    foreign key (item_id, store_id, pack_family)
    references items (id, store_id, base_family),

  -- ★ 같은 품목의 적용 구간이 겹치는 상태를 아예 만들 수 없게 한다
  constraint ex_item_versions_no_overlap
    exclude using gist (item_id with =, validity with &&)
);

create index ix_item_versions_lookup on item_versions (item_id, validity);

-- 그날의 규격을 꺼낸다. 원가 계산은 전부 이걸 통한다.
create or replace function item_as_of(p_item uuid, p_on date)
returns item_versions
language sql stable as $fn$
  select * from item_versions
   where item_id = p_item and validity @> p_on
   limit 1
$fn$;


-- ============================================================================
--  5. 메뉴 · 판매가 이력
-- ============================================================================

create table menus (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name     text not null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint uq_menus_id_store unique (id, store_id),
  constraint uq_menus_name     unique (store_id, name)
);

-- 판매가도 이력이다 — 원가율의 분모이기 때문이다.
-- 가격을 올린 뒤에 과거 원가율을 뽑으면 지금 가격으로 계산돼 실제보다 좋아 보인다.
create table menu_prices (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  menu_id  uuid not null,
  price       numeric(14,2) not null,
  is_tax_free boolean not null default false,
  validity daterange not null default daterange(current_date, null, '[)'),

  constraint fk_menu_prices_menu_same_store
    foreign key (menu_id, store_id) references menus (id, store_id),
  constraint ex_menu_prices_no_overlap
    exclude using gist (menu_id with =, validity with &&)
);


-- ============================================================================
--  6. 레시피 — 버전 구조. 지적 2 의 뒷부분
-- ============================================================================
--
--  ★ is_active 만 두면 "재료를 뺐다" 는 남지만 "언제 뺐는지" 가 안 남는다.
--    줄마다 effective_to 를 두면 표현은 되는데 "3월 15일자 레시피 전체" 를
--    한 번에 집기 어렵다.
--
--    버전으로 두면 판매·제조 기록이 버전 id 하나만 들면 되고,
--    그 시점 레시피가 통째로 고정된다. 재료 제거도 자연히 표현된다
--    (다음 버전에 그 줄이 없다).

-- 6-1. 메뉴 레시피 (아메리카노 = 원두 18g …)
create table menu_recipe_versions (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  menu_id  uuid not null,
  version  int  not null,
  valid_from date not null default current_date,
  valid_to   date,
  note       text,                         -- "원두 1g 줄임" 같은 변경 사유
  created_at timestamptz not null default now(),

  constraint uq_mrv_id_store unique (id, store_id),
  -- ★ 2차 피드백 1 — 판매 기록이 (레시피판, 매장, 메뉴) 로 가리키게 하는 열쇠
  constraint uq_mrv_id_store_menu unique (id, store_id, menu_id),
  constraint uq_mrv_no       unique (menu_id, version),
  constraint fk_mrv_menu_same_store
    foreign key (menu_id, store_id) references menus (id, store_id),
  constraint ck_mrv_range check (valid_to is null or valid_to > valid_from)
);

create table menu_recipe_lines (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  version_id uuid not null,
  item_id    uuid not null,
  amount     numeric(14,4) not null check (amount > 0),
  unit       text not null references units(code),
  unit_family text not null,

  -- ★ 원가에서 빼는 줄. "추출량" 이 여기 해당한다 —
  --   아메리카노에 원두 18g 과 추출량 36g 이 둘 다 있는데
  --   추출량은 사는 게 아니라 결과다. 안 빼면 원두가 두 번 계산된다.
  excluded_from_cost boolean not null default false,

  constraint fk_mrl_version_same_store
    foreign key (version_id, store_id) references menu_recipe_versions (id, store_id),
  constraint fk_mrl_unit_family
    foreign key (unit, unit_family) references units (code, family),

  -- ★ 단위 계열이 품목 기준단위와 같아야 한다. g 을 ml 로 못 적는다.
  constraint fk_mrl_item_same_store_and_family
    foreign key (item_id, store_id, unit_family)
    references items (id, store_id, base_family),

  constraint uq_mrl_once unique (version_id, item_id)
);

-- 6-2. 제조 레시피 (식빵 반죽 = 강력분 … / 르방 = …)
create table make_recipe_versions (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  item_id  uuid not null,                  -- 만들어지는 품목 (kind='made')
  version  int  not null,
  yield_amount numeric(14,4) not null,     -- 1배합 산출량
  yield_unit   text not null references units(code),
  yield_family text not null,

  -- 걸어놓고 몇 시간 뒤에 쓸 수 있나. 콜드브루 12~24h · 반죽 12~18h.
  -- ★ 이 값이 있는 품목은 "오늘 안 걸면 내일 아침에 터지는" 것이다.
  lead_time_hours numeric(6,2),
  -- 돈으로 되돌릴 수 있나. false 면 어떤 방법으로도 못 되돌린다.
  recoverable boolean not null default true,

  valid_from date not null default current_date,
  valid_to   date,
  note       text,
  created_at timestamptz not null default now(),

  constraint uq_krv_id_store unique (id, store_id),
  -- ★ 2차 피드백 1 — 제조 기록·계획이 (레시피판, 매장, 품목) 으로 가리키게 한다
  constraint uq_krv_id_store_item unique (id, store_id, item_id),
  constraint uq_krv_no       unique (item_id, version),
  -- ★ 2차 피드백 2 — 산출 단위 계열이 그 품목의 기준 계열과 같아야 한다.
  --   개수로 나오는 식빵에 산출량을 ml 로 적을 수 없다.
  constraint fk_krv_item_same_store_and_family
    foreign key (item_id, store_id, yield_family)
    references items (id, store_id, base_family),
  constraint fk_krv_yield_family
    foreign key (yield_unit, yield_family) references units (code, family),
  constraint ck_krv_range check (valid_to is null or valid_to > valid_from)
);

create table make_recipe_lines (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  version_id uuid not null,
  ingredient_item_id uuid not null,
  amount     numeric(14,4) not null check (amount > 0),
  unit       text not null references units(code),
  unit_family text not null,
  excluded_from_cost boolean not null default false,

  constraint fk_krl_version_same_store
    foreign key (version_id, store_id) references make_recipe_versions (id, store_id),
  constraint fk_krl_unit_family
    foreign key (unit, unit_family) references units (code, family),
  -- ★ 지적 1 — 다른 매장 재료로 제조 레시피를 구성할 수 없다
  constraint fk_krl_item_same_store_and_family
    foreign key (ingredient_item_id, store_id, unit_family)
    references items (id, store_id, base_family),
  constraint uq_krl_once unique (version_id, ingredient_item_id)
);


-- ============================================================================
--  7. 계획 — 지적 3 의 앞부분 (날짜를 셋으로 나눈다)
-- ============================================================================
--
--  v1 은 "확정일" 한 칸이었다. 그런데 날짜는 셋이다.
--    planned_on   계획을 세운 날
--    expected_on  들어올/만들어질 예정일 (거래처 마감·배송요일·리드타임으로 계산)
--    occurred_on  실제로 들어온/만든 날  ← 실행행에 있다

create table order_plans (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  item_id     uuid not null,
  supplier_id uuid,
  run_id      uuid,                        -- 어느 추천 실행에서 나왔나 (지적 5)

  planned_on  date not null default current_date,
  expected_on date,
  qty         numeric(14,4) not null check (qty > 0),
  unit        text not null references units(code),
  unit_family text not null,
  memo        text,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid,

  constraint uq_order_plans_id_store unique (id, store_id),
  -- ★ 2차 피드백 1 — 입고가 (계획, 매장, 품목) 으로 가리키게 하는 열쇠
  constraint uq_order_plans_id_store_item unique (id, store_id, item_id),
  constraint fk_op_item_same_store_and_family
    foreign key (item_id, store_id, unit_family)
    references items (id, store_id, base_family),
  constraint fk_op_supplier_same_store
    foreign key (supplier_id, store_id) references suppliers (id, store_id),
  constraint fk_op_unit_family
    foreign key (unit, unit_family) references units (code, family)
);

create table bake_plans (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  item_id  uuid not null,
  make_recipe_version_id uuid,
  run_id   uuid,

  planned_on  date not null default current_date,
  expected_on date,                        -- 리드타임을 더한 사용 가능 시점
  batches     numeric(14,4) not null check (batches > 0),   -- 배수 (1.5배)
  memo        text,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid,

  constraint uq_bake_plans_id_store unique (id, store_id),
  -- ★ 2차 피드백 1 — 제조 기록이 (계획, 매장, 품목) 으로 가리키게 하는 열쇠
  constraint uq_bake_plans_id_store_item unique (id, store_id, item_id),
  constraint fk_bp_item_same_store
    foreign key (item_id, store_id) references items (id, store_id),
  -- ★ 2차 피드백 1 — 제조 계획에 붙는 레시피가 그 품목의 레시피여야 한다.
  --   전에는 같은 매장이기만 하면 르방 계획에 식빵 레시피가 붙었다.
  constraint fk_bp_version_same_item
    foreign key (make_recipe_version_id, store_id, item_id)
    references make_recipe_versions (id, store_id, item_id)
);


-- ============================================================================
--  8. 원장 — 실제로 일어난 일
-- ============================================================================

-- 8-1. 판매
create table daily_sales (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  business_date date not null,             -- ★ 달력 날짜가 아니라 영업일
  total_amount numeric(14,2),              -- POS 합계 (대조용)
  ticket_count int,
  memo     text,
  created_at timestamptz not null default now(),

  constraint uq_daily_sales_id_store unique (id, store_id),
  constraint uq_daily_sales_date     unique (store_id, business_date)
);

create table sales_lines (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  daily_sales_id uuid not null,
  menu_id  uuid not null,
  qty      numeric(14,4) not null check (qty > 0),
  unit_price numeric(14,2),

  -- ★ 그때 그 레시피를 가리킨다. 나중에 레시피를 고쳐도 과거 원가가 안 흔들린다.
  menu_recipe_version_id uuid,

  constraint fk_sl_header_same_store
    foreign key (daily_sales_id, store_id) references daily_sales (id, store_id),
  -- ★ 지적 1 — A매장 하루 기록에 B매장 메뉴를 못 붙인다
  constraint fk_sl_menu_same_store
    foreign key (menu_id, store_id) references menus (id, store_id),
  -- ★ 2차 피드백 1 — 아메리카노 판매에 라테 레시피를 못 붙인다.
  --   전에는 같은 매장이기만 하면 통과했다.
  constraint fk_sl_recipe_same_menu
    foreign key (menu_recipe_version_id, store_id, menu_id)
    references menu_recipe_versions (id, store_id, menu_id)
);
create index ix_sales_lines_header on sales_lines(daily_sales_id);

-- 8-2. 입고 — 지적 3 의 뒷부분
create table received_lines (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  item_id  uuid not null,
  supplier_id uuid,

  -- ★ 어느 계획이 이행된 것인가. NULL 을 허용한다 —
  --   계획 없이 급하게 받은 입고가 실제로 있다. 못 넣게 하면 사람이 장부를 안 쓴다.
  order_plan_id uuid,

  occurred_on date not null default current_date,
  qty   numeric(14,4) not null check (qty > 0),
  unit  text not null references units(code),
  unit_family text not null,
  unit_cost   numeric(14,4),               -- 실제 매입가 (규격 이력과 대조)
  item_version_id uuid,                    -- 그때 규격
  memo  text,
  created_at timestamptz not null default now(),

  constraint fk_rl_item_same_store_and_family
    foreign key (item_id, store_id, unit_family)
    references items (id, store_id, base_family),
  constraint fk_rl_supplier_same_store
    foreign key (supplier_id, store_id) references suppliers (id, store_id),
  -- ★ 2차 피드백 1 — 우유 입고에 원두 발주 계획을 못 붙인다
  constraint fk_rl_plan_same_item
    foreign key (order_plan_id, store_id, item_id)
    references order_plans (id, store_id, item_id),
  -- ★ 2차 피드백 1 — 다른 품목의 규격을 못 붙인다
  constraint fk_rl_version_same_item
    foreign key (item_version_id, store_id, item_id)
    references item_versions (id, store_id, item_id),
  constraint fk_rl_unit_family
    foreign key (unit, unit_family) references units (code, family)
);
create index ix_received_by_plan on received_lines(order_plan_id);

-- 8-3. 제조
create table baked_lines (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  item_id  uuid not null,
  bake_plan_id uuid,
  make_recipe_version_id uuid,

  occurred_on date not null default current_date,
  started_at  timestamptz,                 -- 리드타임의 시작. "지금 걸면 → 내일 07:43"
  ready_at    timestamptz,                 -- 사용 가능해지는 시각
  batches     numeric(14,4) not null check (batches > 0),
  qty         numeric(14,4),               -- 실제 산출량
  unit        text not null references units(code),
  unit_family text not null,               -- ★ 2차 피드백 2 — 전에는 이 칸이 없었다
  memo        text,
  created_at  timestamptz not null default now(),

  constraint fk_bl_unit_family
    foreign key (unit, unit_family) references units (code, family),
  -- ★ 2차 피드백 2 — 생산 수량의 단위 계열이 품목 기준 계열과 같아야 한다
  constraint fk_bl_item_same_store_and_family
    foreign key (item_id, store_id, unit_family)
    references items (id, store_id, base_family),
  -- ★ 2차 피드백 1 — 우유 제조 기록에 원두 제조 계획을 못 붙인다
  constraint fk_bl_plan_same_item
    foreign key (bake_plan_id, store_id, item_id)
    references bake_plans (id, store_id, item_id),
  -- ★ 2차 피드백 1 — 그 품목의 레시피여야 한다
  constraint fk_bl_version_same_item
    foreign key (make_recipe_version_id, store_id, item_id)
    references make_recipe_versions (id, store_id, item_id)
);
create index ix_baked_by_plan on baked_lines(bake_plan_id);

-- 8-4. 폐기
create table waste_lines (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  item_id  uuid not null,
  occurred_on date not null default current_date,
  qty   numeric(14,4) not null check (qty > 0),
  unit  text not null references units(code),
  unit_family text not null,
  reason text,                             -- 유통기한 · 품질 · 실수 · 시식
  memo   text,
  created_at timestamptz not null default now(),

  constraint fk_wl_item_same_store_and_family
    foreign key (item_id, store_id, unit_family)
    references items (id, store_id, base_family),
  constraint fk_wl_unit_family
    foreign key (unit, unit_family) references units (code, family)
);

-- 8-5. 재고 실사
create table stock_counts (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  item_id  uuid not null,
  counted_on date not null default current_date,
  qty   numeric(14,4) not null check (qty >= 0),
  unit  text not null references units(code),
  unit_family text not null,

  -- ★ 그날 도중에 품절됐는가.
  --   품절이면 그날 판매량은 **수요가 아니라 재고 한계**다.
  --   이 칸이 없으면 품절난 날이 평균을 끌어내려서 추천이 계속 모자라고,
  --   그러면 또 품절나고, 평균이 더 내려간다. 스스로 악화되는 고리다.
  was_stockout boolean not null default false,

  counted_by uuid,
  memo  text,
  created_at timestamptz not null default now(),

  constraint fk_sc_item_same_store_and_family
    foreign key (item_id, store_id, unit_family)
    references items (id, store_id, base_family),
  constraint fk_sc_unit_family
    foreign key (unit, unit_family) references units (code, family),
  constraint uq_sc_once unique (store_id, item_id, counted_on)
);


-- ============================================================================
--  9. 추천 근거 — 지적 5
-- ============================================================================
--
--  "그때 다시 계산해 보면 되지 않나" 가 안 되는 이유는 원장이 움직이기 때문이다.
--  판매가 정정되고, 단가 이력이 소급 입력되고, 알고리즘이 바뀐다.
--  그리고 "왜 그때 12개를 시켰나" 를 묻는 순간은 거의 항상 사고가 난 다음이다.

create table recommendation_runs (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  ran_at   timestamptz not null default now(),
  ran_by   uuid,

  kind     text not null check (kind in ('order','bake')),
  algo_version text not null,               -- 'order-v3.2' — 코드에서 상수로 보낸다
  params   jsonb not null default '{}',     -- 안전재고일수 · 리드타임 · 반올림 단위
  horizon_from date not null,
  horizon_to   date not null,

  constraint uq_reco_runs_id_store unique (id, store_id)
);

create table recommendation_inputs (
  run_id   uuid not null,
  store_id uuid not null,
  item_id  uuid not null,

  -- ★ 그때 실제로 쓴 값. 지금 원장을 다시 읽으면 안 되는 이유가 이 칸들이다.
  sold_qty   numeric(14,4) not null,
  waste_qty  numeric(14,4) not null default 0,
  on_hand    numeric(14,4) not null,
  unit_cost  numeric(14,4),
  item_version_id uuid,
  lead_days   int,
  safety_days numeric(6,2),

  -- ★ 계산 "결과" 만이 아니라 "단계" 를 남긴다.
  --   추천은 한 번에 나오는 숫자가 아니라 여러 보정을 거친 결과다:
  --     평균 → 품절일 제외 → 요일 보정 → 납품일 반영 → 재고 차감 → 단위 반올림
  --   단계를 안 남기면 "왜 24개인가" 에 답할 때 다시 계산해야 하고,
  --   그 사이 원장이 바뀌었으면 같은 숫자가 안 나온다.
  demand_avg             numeric(14,4),  -- 기간 하루 평균 (예: 우유 1,200ml/일)
  stockout_days_excluded int,            -- 품절이라 평균에서 뺀 날 수
  weekday_adjust         numeric(14,4),  -- 요일 보정 (예: 금요일에 주말치까지)
  round_unit             numeric(14,4),  -- 반올림 단위 (예: 우유 1,000ml 팩)

  recommended_qty numeric(14,4) not null,

  -- ★ 이 한 줄이 나머지 전부보다 실전에서 쓸모 있다.
  --   점주가 보는 것은 숫자 열 개가 아니라 문장 하나다.
  --   '최근 14일 하루 평균 1,200ml · 현재고 800ml · 리드타임 1일 · 안전재고 1일 → 3팩'
  reason text,

  primary key (run_id, item_id),
  constraint fk_ri_run_same_store
    foreign key (run_id, store_id)  references recommendation_runs (id, store_id),
  constraint fk_ri_item_same_store
    foreign key (item_id, store_id) references items (id, store_id),
  -- ★ 2차 피드백 1 — 추천 대상 품목의 규격이어야 한다
  constraint fk_ri_version_same_item
    foreign key (item_version_id, store_id, item_id)
    references item_versions (id, store_id, item_id)
);

-- 계획이 어느 실행에서 나왔는지 (위에서 컬럼만 만들어 뒀다)
alter table order_plans
  add constraint fk_op_run_same_store
  foreign key (run_id, store_id) references recommendation_runs (id, store_id);

alter table bake_plans
  add constraint fk_bp_run_same_store
  foreign key (run_id, store_id) references recommendation_runs (id, store_id);


-- ============================================================================
--  10. 뷰 — 상태는 저장하지 않고 계산한다
-- ============================================================================
--
--  ★ status 칸을 두면 실행이 들어올 때마다 사람이 갱신해야 하고, 반드시 어긋난다.
--    뷰로 만들면 원장과 절대 안 어긋난다.

create or replace view v_order_fulfillment as
select
  p.store_id,
  p.id   as order_plan_id,
  p.item_id,
  p.planned_on,
  p.expected_on,
  p.qty                            as 계획수량,
  coalesce(sum(r.qty), 0)          as 입고수량,
  p.qty - coalesce(sum(r.qty), 0)  as 미입고,
  min(r.occurred_on)               as 첫입고일,
  case
    when p.cancelled_at is not null                      then '취소'
    when coalesce(sum(r.qty),0) = 0
     and p.expected_on is not null
     and p.expected_on < current_date                    then '미이행'
    when coalesce(sum(r.qty),0) = 0                      then '대기'
    when coalesce(sum(r.qty),0) < p.qty                  then '부분입고'
    when coalesce(sum(r.qty),0) = p.qty                  then '완료'
    else '초과입고'
  end as 상태
from order_plans p
left join received_lines r
       on r.order_plan_id = p.id and r.store_id = p.store_id
group by p.store_id, p.id, p.item_id, p.planned_on, p.expected_on, p.qty, p.cancelled_at;

comment on view v_order_fulfillment is
  '미이행 = 내일 아침에 물건이 없다. 초과입고 = 대개 같은 걸 두 번 시켰다. 둘 다 v1 에서는 아무 데도 안 떴다';

create or replace view v_bake_fulfillment as
select
  p.store_id,
  p.id as bake_plan_id,
  p.item_id,
  p.planned_on,
  p.expected_on,
  p.batches                          as 계획배수,
  coalesce(sum(b.batches), 0)        as 제조배수,
  min(b.ready_at)                    as 사용가능시각,
  case
    when p.cancelled_at is not null                   then '취소'
    when coalesce(sum(b.batches),0) = 0
     and p.expected_on is not null
     and p.expected_on < current_date                 then '미이행'
    when coalesce(sum(b.batches),0) = 0               then '대기'
    when coalesce(sum(b.batches),0) < p.batches       then '부분제조'
    else '완료'
  end as 상태
from bake_plans p
left join baked_lines b
       on b.bake_plan_id = p.id and b.store_id = p.store_id
group by p.store_id, p.id, p.item_id, p.planned_on, p.expected_on, p.batches, p.cancelled_at;


-- 메뉴 원가를 '그날 값' 으로 계산한다.
-- ★ left join 인 것이 중요하다. 단가를 못 구한 재료를 0원으로 세지 않고
--   missing_count 로 따로 세어 화면이 그 사실을 말할 수 있게 한다.
--   0원으로 세면 원가율이 실제보다 낮게 나오고, 점주가 그 숫자로 판매가를 정한다.
create or replace function menu_cost_as_of(p_menu uuid, p_on date)
returns table (material_cost numeric, missing_count int)
language sql stable as $fn$
  with v as (
    select id from menu_recipe_versions
     where menu_id = p_menu
       and p_on >= valid_from
       and (valid_to is null or p_on < valid_to)
     limit 1
  )
  select
    coalesce(sum(l.amount * iv.unit_cost / nullif(iv.per_unit, 0)), 0),
    count(*) filter (where iv.id is null)::int
  from v
  join menu_recipe_lines l on l.version_id = v.id and not l.excluded_from_cost
  left join lateral (
    select * from item_versions x
     where x.item_id = l.item_id and x.validity @> p_on
     limit 1
  ) iv on true
$fn$;


-- ============================================================================
--  11. RLS — 지적 4. 반드시 앱 코드 수정과 같이 배포한다
-- ============================================================================

-- ★ users 에도 RLS 를 켜면, users 를 조회하는 정책이 다시 users 의 정책을
--   부르면서 무한 재귀로 터진다. security definer 로 한 번 끊는다.
-- ★ search_path 를 고정하지 않으면 함수 탈취 경로가 된다.
create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select store_id from public.users where id = auth.uid()
$fn$;

revoke execute on function public.current_store_id() from public;
grant  execute on function public.current_store_id() to authenticated;

-- store_id 를 가진 public 테이블 전부에 격리 정책을 건다
do $do$
declare t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public'
                      and table_name = c.relname
                      and column_name = 'store_id')
  loop
    execute format('alter table public.%I enable row level security', t);
    -- ★ force 가 없으면 테이블 소유자에게는 RLS 가 적용되지 않는다
    execute format('alter table public.%I force  row level security', t);

    -- ★ using 만 쓰면 읽기·삭제만 막히고 INSERT 는 그대로 통과한다.
    --   with check 가 새로 쓰는 행을 검사하는 조건이다. 둘 다 있어야 한다.
    execute format(
      'create policy store_isolation on public.%I '
      'for all to authenticated '
      'using (store_id = public.current_store_id()) '
      'with check (store_id = public.current_store_id())', t);
  end loop;
end
$do$;

-- users 는 store_id 를 갖지만 자기 행만 쓰게 따로 건다
drop policy if exists store_isolation on public.users;
alter table public.users enable row level security;
alter table public.users force  row level security;

create policy users_read_own_store on public.users
  for select to authenticated
  using (store_id = public.current_store_id());

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and store_id = public.current_store_id());

-- stores 는 store_id 가 없다 (자기가 매장이다). 따로 건다.
alter table public.stores enable row level security;
alter table public.stores force  row level security;
create policy stores_read_own on public.stores
  for select to authenticated
  using (id = public.current_store_id());

-- units 는 공용 참조표다. 읽기만 연다.
alter table public.units enable row level security;
-- ★ 2차 검증에서 잡힌 것 — 여기만 force 가 빠져 있었다.
--   units 는 매장 소유가 아니라 공용 참조표지만, 그래도 표 주인까지 막아야
--   "RLS 가 안 걸린 표가 하나도 없다" 를 증명할 수 있다.
--   쓰기 정책이 아예 없으므로 읽기만 되고 수정은 전부 거부된다.
--   (단위를 새로 넣는 것은 마이그레이션 작업이다 — RLS 를 켜기 전에 한다)
alter table public.units force  row level security;
create policy units_read_all on public.units for select to authenticated using (true);


-- ============================================================================
--  12. 검증 — 이 두 조회문이 빈 결과여야 끝난 것이다
-- ============================================================================

-- 12-1. RLS 가 안 걸린 테이블 (한 줄도 안 나와야 한다)
--
-- select c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.polname)
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   left join pg_policy p on p.polrelid = c.oid
--  where n.nspname = 'public' and c.relkind = 'r'
--  group by 1,2,3
-- having c.relrowsecurity = false or count(p.polname) = 0;

-- 12-2. 매장을 건너는 참조가 남아 있는지 (한 줄도 안 나와야 한다)
--
-- select conname, conrelid::regclass as 테이블
--   from pg_constraint c
--  where contype = 'f'
--    and array_length(conkey, 1) = 1
--    and connamespace = 'public'::regnamespace
--    and exists (select 1 from information_schema.columns
--                 where table_name = conrelid::regclass::text
--                   and column_name = 'store_id')
--    and exists (select 1 from information_schema.columns
--                 where table_name = confrelid::regclass::text
--                   and column_name = 'store_id');

-- ============================================================================
--  끝. v1 대비 바뀐 것 요약
--
--   · 단일 FK 0개 — 매장을 가진 참조는 전부 복합 FK (id, store_id)
--   · 재료를 이름으로 안 잇는다 — items 가 마스터, 레시피는 id 참조
--   · g ↔ ml 을 DB 가 막는다 — units(code, family) 복합 FK
--   · 원가에 들어가는 값 전부가 기간 이력 — daterange + EXCLUDE 로 겹침 금지
--   · 레시피는 버전 — 재료 제거가 표현되고 과거 원가가 안 흔들린다
--   · 계획 날짜 3분화 + 실행행이 계획을 가리킨다 (부분입고·초과입고 구분)
--   · 이행 상태는 저장 안 하고 뷰로 계산 — 원장과 어긋날 수 없다
--   · 추천은 실행·입력·이유가 남는다
--   · 전 테이블 RLS (force + using + with check)
-- ============================================================================
