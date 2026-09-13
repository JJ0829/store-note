# Replit 에서 매장수첩 돌리기

> 2026-09-13. **이건 배포가 아니다.** 배포처는 Vercel 하나고 순서는
> [배포.md](배포.md) 에 있다. 여기는 **노트북이 없을 때 브라우저만으로
> 고치고 확인하는 개발 환경**이다. 두 개를 섞으면 공개 주소가 두 벌이 되고,
> 어느 쪽이 최신인지 아무도 모르게 된다.

---

## 0. 먼저 결정할 것 — 레시피가 새는가

⚠️ **저장소는 비공개다. 레시피가 영업비밀이기 때문이다.**
Replit 으로 가져오는 순간 그 코드가 Replit 계정 안에 복사된다.

**들어가기 전에 반드시 확인할 것:** 만든 Repl 이 **Private** 인지.
(Replit 은 요금제·가입 시기에 따라 기본값이 달랐다. 화면에서 직접 볼 것.)
**Public 이면 `data/seed.json` 이 그대로 공개된다.**

다행히 **지금 시드의 레시피 수치는 플레이스홀더(표준 비율)다.**
그래서 지금 옮기는 건 안전하다. 하지만 **실매장 수치를 넣은 뒤에는
Private 확인 없이 절대 옮기지 말 것.**

---

## 1. 가져오기

Replit → **Create App → Import from GitHub** → `JJ0829/store-note`.
비공개 저장소라 **GitHub 계정 연결**을 한 번 요구한다.

가져오면 아래 세 파일이 이미 들어 있다. 손댈 필요 없다.

| 파일 | 하는 일 |
|---|---|
| `.replit` | Node 22 · Run 버튼 · 포트 3000 → 80 |
| `package.json` 의 `dev:replit` | `next dev -H 0.0.0.0` — **이게 핵심이다** |
| `next.config.ts` 의 `allowedDevOrigins` | `*.replit.dev` 에서 HMR 이 되게 |

> **왜 `-H 0.0.0.0` 인가.** Next 는 기본으로 `localhost` 에만 귀를 연다.
> Replit 은 컨테이너 **밖**에서 들어오므로 그대로 두면 웹뷰가 영원히 빈 화면이다.
> 로그에는 `ready` 라고 찍혀 있어서 원인을 찾기 어렵다.

---

## 2. Secrets 넣기

왼쪽 **Tools → Secrets**. `.env.local` 을 쓰지 말 것 — Replit 에서는
파일이 남고, 실수로 커밋되면 키가 저장소로 들어간다.

| 키 | 안 넣으면 | 급한가 |
|---|---|---|
| `STORE_PIN` | **레시피가 안 잠긴다.** 화면이 빨간 띠로 알린다 | 실매장 수치 넣기 전 필수 |
| `GEMINI_API_KEY` | `/shoot` 의 촬영 목록 만들기만 "키가 없습니다" | 그 기능 볼 때만 |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | 지표가 로컬 파일로 떨어지고 사진 업로드가 안 됨 | 선택 |
| `NEXT_PUBLIC_SITE_URL` | 카톡 미리보기만 안 뜸 | 여기선 넣지 말 것 ↓ |

⚠️ **`NEXT_PUBLIC_SITE_URL` 은 Replit 에 넣지 않는다.** 빌드 시점에 박히는
값이라, 여기서 Vercel 주소를 넣어두면 개발용 화면이 운영 주소를 가리키고
반대도 마찬가지다. 이 칸은 Vercel 한 곳에서만 관리한다.

⚠️ **Supabase 를 연결하면 지표 표가 개발용 클릭으로 오염된다.** 사장님이
나중에 그 표를 보고 판단하는 숫자다. 볼 일이 없으면 두 칸을 비워둘 것.

---

## 3. 돌리기

**Run** 버튼 = `npm run dev:replit`.
처음 한 번은 의존성이 없으므로 셸에서 먼저:

```bash
npm install
```

| 주소 | 화면 |
|---|---|
| 웹뷰 기본 | 사장님 화면 |
| `/t/cafe-open` | 교육 모드 |
| `/p/cafe-open` | 체크리스트 |

슬러그는 `data/seed.json` 의 `shareSlug` — `cafe-open` · `cafe-close` · `bakery-morning`.

---

## 4. 점검

```bash
npm run check
```

타입 + 빌드 + 테스트 + DB 스키마 검사까지 다 돈다.

⚠️ **Run 으로 dev 서버를 켜둔 채 `npm run check` 를 하면 안 된다.**
`npm run build` 가 `.next` 를 덮어써서 dev 서버가 죽는다. Windows 에서와
같은 함정이고 Replit 이라고 다르지 않다. **Stop 하고 나서 돌릴 것.**

⚠️ **`npm run check | tail` 로 보지 말 것.** 파이프라인은 `tail` 의
종료코드를 돌려주므로 **실패해도 0 으로 보인다.**

```bash
npm run check > /tmp/check.log 2>&1; echo $?
```

---

## 5. Replit 에서 고친 걸 되가져오기

Replit 의 Git 패널에서 **브랜치를 만들어 push** 하고 GitHub 에서 PR 로 합친다.
`main` 에 직접 밀지 않는다 — `main` 은 Vercel 이 그대로 배포하는 가지다.

⚠️ **`.replit` 은 Replit 이 스스로 고쳐 쓴다.** (모듈 추가·포트 감지 등)
그 변경이 커밋에 섞여 들어오면 리뷰에서 놓치기 쉽다. push 전에
`git diff .replit` 을 한 번 볼 것.

---

## 6. Replit 에 배포하지 않는 이유

`.replit` 에 `[deployment]` 칸은 만들어 뒀다 — 급할 때 한 번 띄워 보라고.
하지만 **정식 배포는 Vercel 이다.**

- 공개 주소가 둘이 되면 직원이 카톡으로 받은 링크가 어느 쪽인지 모른다
  (→ 기억 속의 주소가 또 하나 늘어난다. 이 제품이 푸는 문제의 반대다)
- `STORE_PIN` 을 양쪽에 따로 넣어야 하고, 한쪽만 빠지면 그쪽이 **안 잠긴다**
- 심사에서 말할 배포 주소는 한 줄이어야 한다

배포는 [배포.md](배포.md) 를 본다.
