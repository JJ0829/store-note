-- ===========================================================================
--  근로계약 — 앱에 있는데 표에 없던 칸 둘
--
--  ★ 2026-09-13, 계약서를 서버로 옮기다가 찾았다.
--
--    앱의 `Contract` 에는 있는데 `public.contracts` 에는 없는 칸이 둘이다.
--
--      handedOver … 근로기준법 제17조. 서면으로 만들어 **교부까지 했는가**
--      insured    … 4대보험 가입 여부
--
--    둘 다 `src/lib/contracts.ts` 의 **법정 점검이 실제로 읽는 값**이다.
--    이 칸이 없으면 옮기는 순간 그 점검이 전부 «안 했음» 으로 바뀐다 —
--    앱이 «교부 안 했습니다» 라고 거짓으로 경고하게 된다.
--
--    memo 에 끼워 넣는 방법도 있지만 그러면 사람이 쓴 메모와 섞여서
--    나중에 아무도 못 읽는다. 칸으로 두는 것이 맞다.
--
--  ★ 기본값을 false 로 둔다
--    «안 했다» 가 안전한 쪽이다. true 로 두면 하지도 않은 교부를
--    했다고 표시하고, 그 화면을 보고 사장님이 넘어간다.
-- ===========================================================================

alter table public.contracts
  add column if not exists handed_over boolean not null default false;

alter table public.contracts
  add column if not exists insured boolean not null default false;

comment on column public.contracts.handed_over is
  '근로기준법 제17조 — 서면 근로계약서를 교부했는가';
comment on column public.contracts.insured is
  '4대보험 가입 여부';
