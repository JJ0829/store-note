-- ===========================================================================
--  이용 기록(지표) 표 — 매장수첩 첫 번째 서버 표
--
--  ★ 왜 이것만 먼저 올리나 (D-002 예외 조항)
--    "Supabase 연결 중 **이벤트 저장 부분만**은 예외로 먼저 할 수 있다.
--     현재 /api/log 가 배포 환경에서 동작하지 않아 **가설 검증 자체가
--     불가능**하기 때문이다. 이것은 기능 추가가 아니라 검증 인프라 복구다."
--
--    즉 이 표는 **기능이 아니다.** 운영 데이터(매출·시급·단가·레시피)는
--    여전히 브라우저에 있고, 그것을 옮기는 것은 WBS 10.3 이다.
--
--  ★ 지켜야 하는 규율 — 여기에 이름과 금액을 담지 않는다
--    "채워졌는가"만 남기고 "무엇이 채워졌는가"는 안 남긴다.
--    담기 시작하면 이 표가 개인정보·영업비밀 표가 된다.
--    보내는 쪽(src/lib/metrics.ts)과 받는 쪽(src/app/api/log/route.ts)이
--    같이 지키고, tests/metrics.test.ts 가 못 박는다.
-- ===========================================================================

create table if not exists public.events (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  event  text        not null,
  -- 나머지 칸(sessionId · slug · durationSec …)은 여기 통째로 들어간다.
  -- 칸을 늘릴 때마다 마이그레이션을 하지 않으려고 jsonb 로 둔다.
  props  jsonb       not null default '{}'::jsonb,

  -- 공개 엔드포인트가 넣는 표다. 이름 길이는 DB 가 직접 막는다
  constraint events_event_len check (char_length(event) between 1 and 40)
);

-- 분석은 "언제"와 "무슨 이벤트"로만 한다
create index if not exists events_at_idx       on public.events (at desc);
create index if not exists events_event_at_idx on public.events (event, at desc);

alter table public.events enable row level security;

-- ── 접근 통제 ───────────────────────────────────────────────────────────
--  ★ 쌓기만 한다. 익명 키로는 **읽을 수 없다.**
--    /api/log 는 인증이 없는 공개 엔드포인트라 키가 새어도 이상하지 않다.
--    새더라도 할 수 있는 일이 "이벤트를 넣는 것"뿐이어야 한다 —
--    그건 엔드포인트가 이미 누구에게나 허용하는 일이다.
--
create policy events_anon_insert on public.events
  for insert to anon with check (true);

-- 읽기는 로그인한 사람만. 지금은 로그인이 없으므로 사실상 아무도 못 읽는다
-- (대시보드/SQL 편집기는 서비스 역할이라 이 정책과 무관하게 읽는다).
-- 사장님 로그인이 붙으면(WBS 10.2) 여기서 매장 단위로 좁힌다.
create policy events_auth_select on public.events
  for select to authenticated using (true);

-- ★★ 정책만으로는 **안 된다.** 여기서 실제로 걸렸다 (2026-09-12 실측).
--
--   정책(policy)은 «어느 줄을» 을 정하고, 권한(grant)은 «그 동작을 아예 할 수
--   있는가» 를 정한다. 둘은 다른 층이다. 정책만 만들고 권한을 안 주면
--   `permission denied for table events` 가 난다 — 그런데 지표를 넣는 쪽은
--   실패를 삼키도록 되어 있어서(화면이 멈추면 안 되므로) **아무 일도 안 일어난
--   것처럼 보이고 표만 영원히 비어 있다.**
--
--   이 표를 새 프로젝트에 올릴 때 이 두 줄을 빠뜨리면 같은 일이 다시 난다.
grant insert on public.events to anon;
grant select on public.events to authenticated;
