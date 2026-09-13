-- ===========================================================================
--  촬영 사진·영상 보관함 — 매장수첩 두 번째 서버 자원
--
--  ★ 왜 옮기나 (2026-09-13)
--    촬영 업로드를 **서버 폴더(`public/media/`)에 쓰고 있었다.** 로컬에서는
--    되지만 배포본(Vercel)은 폴더가 읽기 전용이라 **안 된다.** 그래서 사장님이
--    사진을 넣으려면 «컴퓨터에서 앱 띄우기 → 찍어 넣기 → 커밋 → 배포» 를
--    해야 했다. 매장에서 폰으로 찍는 도구인데 그 동선이 막혀 있으면
--    **촬영은 영영 0장으로 남는다** — 실제로 91개 중 0개였다.
--
--    여기로 옮기면 **매장에서 폰으로 배포 주소를 열고 찍으면 끝**이다.
--
--  ★ 공개 버킷이 아니다 (public = false)
--    이 사진들은 레시피의 시연 장면이다. 공개 버킷으로 두면
--    `.../object/public/media/t-open-5-good.jpg` 처럼 **이름이 뻔한 주소**가
--    영구히 열린다 — 항목 id 는 화면에 그대로 적혀 있어 추측이 쉽다.
--    레시피를 서버가 막아둔 것(`STORE_PIN` · `ServerStoreGate`)과 앞뒤가
--    안 맞는다. 그래서 **서명된 주소**로만 내보낸다(`/api/media` 가 만든다).
--
--  ★ 익명 키로 한다 — 서비스 역할 키를 쓰지 않는다
--    `0001_events.sql` 과 같은 이유다. 서비스 역할 키는 한 번 새면 전부
--    읽히는데, 이 키는 서버 라우트에서만 읽으므로(NEXT_PUBLIC_ 아님)
--    브라우저 번들에 안 들어간다. 익명 키로 할 수 있는 일을 **이 버킷 안으로**
--    좁혀두면, 새더라도 할 수 있는 일이 촬영 파일을 다루는 것뿐이다.
-- ===========================================================================

-- 50MB — 폰으로 찍은 30초 영상이 보통 30~60MB 다.
-- 허용 형식을 여기서 막는다. 화면(`/api/media`)도 같이 막지만,
-- **화면을 거치지 않고 서명 주소로 바로 올릴 수 있으므로** DB 가 최종 방어선이다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 접근 통제 ───────────────────────────────────────────────────────────
--  ★ 넷 다 **이 버킷 안으로만** 한정한다 (`bucket_id = 'media'`).
--    조건을 빼면 익명 키가 프로젝트의 모든 버킷을 다루게 된다 —
--    지금은 버킷이 하나지만 나중에 하나 더 만드는 순간 조용히 뚫린다.
--
--  select  — 서명 주소를 만들려면 읽기 권한이 있어야 한다
--  insert  — 서명 업로드 주소를 만들려면 넣기 권한이 있어야 한다
--  update  — 같은 자리에 다시 찍어 올릴 때(덮어쓰기)
--  delete  — 잘못 찍은 것 지우기

drop policy if exists media_anon_select on storage.objects;
create policy media_anon_select on storage.objects
  for select to anon using (bucket_id = 'media');

drop policy if exists media_anon_insert on storage.objects;
create policy media_anon_insert on storage.objects
  for insert to anon with check (bucket_id = 'media');

drop policy if exists media_anon_update on storage.objects;
create policy media_anon_update on storage.objects
  for update to anon using (bucket_id = 'media') with check (bucket_id = 'media');

drop policy if exists media_anon_delete on storage.objects;
create policy media_anon_delete on storage.objects
  for delete to anon using (bucket_id = 'media');

-- ★★ 정책만으로는 안 된다 — `0001_events.sql` 이 같은 자리에서 걸렸다.
--    정책(policy)은 «어느 줄을», 권한(grant)은 «그 동작을 아예 할 수 있는가».
--    Supabase 는 `storage.objects` 에 기본 권한을 주지만, 프로젝트마다
--    다를 수 있으므로 여기서 명시한다. 없으면 `permission denied` 가 나고
--    화면은 "넣지 못했습니다" 만 보여준다.
grant select, insert, update, delete on storage.objects to anon;
grant select on storage.buckets to anon;
