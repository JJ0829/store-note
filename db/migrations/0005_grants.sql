-- ===========================================================================
--  표 권한 — RLS 만으로는 안 된다
--
--  ★ 2026-09-13 에 실제로 걸렸다. 로그인은 되는데 화면에 「로그인」 버튼이
--    그대로 남아 있었다.
--
--      ① 로그인 → Supabase 인증 성공 (auth.users.last_sign_in_at 남음)
--      ② 토큰 쿠키 저장 → 정상
--      ③ 앱이 "누구세요?" 를 물으려고 users 표 조회 → permission denied
--      ④ 못 읽었으니 anon 으로 판정 → 화면은 로그인 전과 똑같다
--
--    ★ 아무 오류도 안 뜬다. `whoAmI()` 가 실패를 `{state:"anon"}` 으로 삼키기
--      때문이다(화면이 멈추면 안 되므로). 그래서 **로그인이 안 된 것처럼 보인다** —
--      실제로는 인증이 됐고 권한만 없다. 서버 기록만 보면 «성공» 으로 읽힌다.
--
--  ★ 왜 빠졌나 — 정책과 권한은 다른 층이다
--
--      정책(policy) = «어느 줄을» 볼 수 있나
--      권한(grant)  = «그 동작을 아예» 할 수 있나
--
--    `0003_schema_v2` 가 표 37개에 RLS 와 정책을 다 만들었는데 grant 를 안 했다.
--    `0001_events.sql` 맨 아래에 이 함정을 경고로 적어뒀는데도 같은 일이 났다.
--    실측: 표 38개 중 authenticated 가 SELECT 할 수 있던 것은 events 하나뿐.
--
--  ★ 권한을 줘도 새지 않는다
--
--    RLS 가 38개 표 전부에 켜져 있다. 권한은 «문을 열어주는 것» 이고
--    RLS 가 «어느 방까지 들어갈지» 를 정한다. 자기 매장 줄만 보인다.
--    **anon 에게는 아무것도 주지 않는다** — events 의 insert 만 예외이고
--    그건 0001 에서 이미 따로 줬다.
-- ===========================================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 앞으로 만들 표에도 같은 권한이 붙게 한다. 이게 없으면 표를 하나 더할 때마다
-- 같은 함정에 다시 빠진다 — 그리고 증상이 «로그인이 안 된다» 로 나타난다.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
