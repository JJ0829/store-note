# 주방 신입 온보딩 체크리스트

포지션별 SOP 체크리스트를 **가입 없이 링크 하나로** 볼 수 있게 하는 모바일 웹.

검증하려는 가설: *"신입이 체크리스트만 봐도 선배가 붙어서 알려주는 시간이 줄어든다."*

## 실행

```bash
npm run dev
```

- `http://localhost:3000` — 사장님 화면 (포지션 목록)
- `http://localhost:3000/t/grill-day1` — **교육 모드** (매장 태블릿, 첫날 교육용)
- `http://localhost:3000/p/grill-day1` — **체크리스트** (개인 링크, 나중에 혼자 확인)

## 화면이 두 개인 이유

주방 벽에는 이미 코팅한 체크리스트가 붙어 있습니다. 그러니 *체크리스트를 준다*는 것 자체는 새로운 가치가 아닙니다. 이 제품이 얹는 건 **사진·영상**, **수정 비용 0**, **기록**뿐이고, 그게 가장 크게 먹히는 순간은 **첫날 교육 10~30분**입니다.

| | `/t/` 교육 모드 | `/p/` 체크리스트 |
|---|---|---|
| 언제 | 첫날, 앉아서 한 번 | 일하다가 확인 |
| 기기 | 매장 공용 태블릿 (가로) | 개인 폰 |
| 형태 | 한 항목씩 큰 화면으로 넘김 | 스크롤 목록 |
| 저장 | sessionStorage (1회분, 끝나면 삭제) | localStorage (날짜별 초기화) |

**공용 태블릿이라 저장 방식이 다릅니다.** 교육 모드가 localStorage에 진도를 남기면 앞사람이 체크한 화면을 다음 신입이 그대로 보게 됩니다. 그래서 교육 모드는 `[시작하기]`를 누를 때마다 새 세션(`runId`)을 만들고, 끝나면 지웁니다.

또 "꼭 지키기"(`critical: true`) 항목은 `[읽었습니다]`를 눌러야 다음으로 넘어갑니다. 이게 *"신입이 첫날 실수 없이 완료한 항목 수"* 지표의 원본 데이터가 됩니다.

## 지금 들어 있는 것 (1단계)

| | 상태 |
|---|---|
| 교육 모드 (`/t/`) — 태블릿, 한 장씩, 필수항목 확인 게이트 | 완료 |
| 체크리스트 (`/p/`) — 개인 링크, 스크롤 목록 | 완료 |
| 섹션·필수항목·선배 한마디·사진·영상 | 완료 |
| 지표 기록 (조회·교육 시작/완료·소요시간·필수항목 확인·설문) | 완료 (로컬 파일) |
| 카카오톡 미리보기 og 태그 | 완료 |
| 사장님용 편집 화면 | 미구현 (2단계) |
| AI 초안 생성 | 미구현 (3단계) |

## 쌓이는 지표 (`data/events.jsonl`)

| event | 뜻 |
|---|---|
| `view` | 체크리스트 링크를 열었다 |
| `training_start` | 태블릿에서 교육을 시작했다 |
| `critical_confirm` | 필수 항목을 읽고 확인을 눌렀다 |
| `training_complete` | 교육을 끝냈다 (`durationSec` = 실제 걸린 시간) |
| `survey` | "선배에게 몇 번 물어봤나" 응답 |

`training_complete.durationSec`이 실제 교육 시간이고, `survey`가 선배가 붙은 정도의 대리 지표입니다. 이 둘을 붙여서 보면 가설이 검증됩니다.

## 구조

```
data/seed.json              ← 지금은 이 파일이 DB. 체크리스트 내용 전부 여기 있음
data/events.jsonl           ← 조회·설문 기록이 쌓이는 곳 (git에는 안 올라감)
src/lib/repo.ts             ← 데이터 접근. Supabase로 옮길 때 여기만 고치면 됨
src/lib/types.ts
src/app/page.tsx            ← 사장님 화면
src/app/t/[slug]/page.tsx   ← 교육 모드 (태블릿)
src/app/p/[slug]/page.tsx   ← 체크리스트 (공유 링크)
src/app/api/log/route.ts    ← 지표 수집
src/components/TrainingMode.tsx
src/components/ChecklistView.tsx
public/photos/              ← 지금은 회색 플레이스홀더. 실제 사진으로 교체
```

## 내용 고치기

`data/seed.json`만 고치면 됩니다. 저장하면 새로고침만으로 반영됩니다.

- **포지션 추가** — `positions` 배열에 항목 추가. `shareSlug`가 링크 주소(`/p/{shareSlug}`)가 됩니다.
- **사진 넣기** — 사진을 `public/photos/`에 넣고 `imageUrl`을 `"/photos/파일명.jpg"`로.
- **영상 넣기** — 유튜브에 **일부공개(Unlisted)** 로 올리고 그 주소를 `videoUrl`에 그대로 붙여넣으면 됩니다. 자체 업로드는 만들지 마세요. 시간만 많이 듭니다.
- **`critical: true`** — 위생·안전처럼 절대 건너뛰면 안 되는 항목. 빨간 테두리와 "꼭 지키기" 표시가 붙습니다.

## 다음 단계

**2단계 — Supabase 연결 (2~3일)**
지금은 파일이 DB라서 배포 환경에서 내용을 못 고칩니다. 아래 표를 만들고 `src/lib/repo.ts`의 함수 본문만 쿼리로 바꾸면 됩니다.

```sql
create table store    (id uuid primary key, name text, slug text unique);
create table position (id uuid primary key, store_id uuid references store,
                       name text, subtitle text, summary text,
                       share_slug text unique, sort_order int);
create table section  (id uuid primary key, position_id uuid references position,
                       title text, note text, sort_order int);
create table task     (id uuid primary key, section_id uuid references section,
                       title text, description text, tip text,
                       critical bool default false,
                       image_url text, video_url text, sort_order int);
create table event    (id bigserial primary key, position_id uuid,
                       session_id text, kind text, payload jsonb,
                       created_at timestamptz default now());
```

**3단계 — 사장님용 편집 화면 (3~4일)**
포지션 만들기 / 항목 추가·순서변경 / 사진 업로드.

**4단계 — AI 초안 생성 (1~2일)**
포지션명 + 핵심 업무 몇 개 → 체크리스트 JSON 생성. `ANTHROPIC_API_KEY`를 `.env`에 넣고 서버 라우트 하나 추가하면 됩니다.

> 다만 초기 매장 2~3곳까지는 **자동화하지 말고 직접 만들어 주는 편**을 권합니다. AI가 뽑은 초안이 현장에서 실제로 쓸 만한지부터 확인해야 자동화할 가치가 생깁니다.

## 배포

Vercel에 올리면 됩니다. 올리기 전에 환경변수 `NEXT_PUBLIC_SITE_URL`을 실제 주소로 설정해야 카카오톡 미리보기가 제대로 뜹니다.

주의: Vercel은 파일 쓰기가 막혀 있어 `data/events.jsonl` 기록이 동작하지 않습니다. 지표를 실제로 모으려면 2단계(Supabase)를 먼저 하세요.

## 앱은?

당분간 만들지 않습니다. 신입이 첫 출근날 앱을 설치할 확률보다 카톡 링크를 누를 확률이 훨씬 높고, 지금 검증하려는 가설에는 웹으로 충분합니다. 필요해지면 이 웹에 PWA(홈 화면 추가)를 얹는 게 다음 순서입니다.
