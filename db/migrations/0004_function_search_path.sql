-- ===========================================================================
--  0004 — 함수 세 개에 search_path 를 고정한다
--
--  ★ 왜 (2026-09-13 · 0003 올린 직후 Supabase 보안 점검이 잡음)
--
--    `schema_v2.sql` 은 `current_store_id()` 에 대해 이렇게 적어 뒀다 —
--      "search_path 를 고정하지 않으면 함수 탈취 경로가 된다"
--
--    맞는 말인데 **나머지 세 함수에는 그 규칙을 안 적용했다.**
--    부르는 쪽이 search_path 를 바꿔 두면, 함수 안의 `stores` · `item_versions`
--    같은 이름이 **엉뚱한 표로 풀린다.** 원가 계산이 조용히 틀리는 경로다.
--
--    세 함수는 SECURITY INVOKER(기본)라 권한이 올라가지는 않는다.
--    그래서 급한 구멍은 아니지만, **한 파일 안에서 규칙이 갈리는 것**이 더 나쁘다.
--
--  ★ 본문을 다시 적지 않는다. `alter function ... set` 으로 설정만 붙인다 —
--    본문을 베껴 쓰면 그 자리가 또 갈라진다.
-- ===========================================================================

alter function public.business_date(uuid, timestamptz)
  set search_path = public, pg_temp;

alter function public.item_as_of(uuid, date)
  set search_path = public, pg_temp;

alter function public.menu_cost_as_of(uuid, date)
  set search_path = public, pg_temp;
