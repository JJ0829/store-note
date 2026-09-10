# 매장수첩

개인 카페·베이커리의 **매장 운영 도구.** 모바일 웹 (Next.js 15 · React 19 · TypeScript).

> **주방의 모든 기준이 사람 머릿속에 있다.**
> 프렙 양은 김대리만 알고 발주 수량은 사장님만 알아서, 그 사람이 쉬면 주방이 흔들린다.
> 신입 교육이 힘든 건 증상 하나일 뿐이다.

처음엔 신입 온보딩 체크리스트였는데 운영 기능 7종이 붙으면서 **매장 전체**를 다룬다.
그래서 '주방'이 아니라 '매장'이다 — 홀 직원도 출퇴근을 찍고, 매출·거래처·계약서는 주방 밖 일이다.

---

## 실행

```bash
npm run dev
```

| 주소 | 무엇 |
|---|---|
| `http://localhost:3000` | 오늘 (첫 화면) |
| `/prep` | **프렙 목록 + 레시피 찾기** — 매일 가장 먼저 열리는 화면 |
| `/prep/afternoon` | 오후 프렙 (`evening` 마감 준비 · `cycle` 주기 점검) |
| `/t/cafe-open` | 교육 모드 (태블릿, 한 장씩) |
| `/p/cafe-open` | 체크리스트 (개인 링크, 스크롤) |
| `/order` `/attendance` `/sales` `/cost` `/vendors` `/contracts` `/roster` `/backup` `/shoot` | 운영 기능 |

슬러그는 `data/seed.json` 의 `shareSlug` — `cafe-open` · `cafe-close` · `bakery-morning`.

```bash
npm test          # node --test · 425개
npm run typecheck # tsc --noEmit · dev 서버를 안 죽인다
npm run build     # ⚠️ dev 서버를 끄고 돌릴 것 (.next 가 덮어써진다)
```

**Node 22.18 이상.** 셸에서 `node` 가 안 잡히면 PATH 를 새로고침해야 한다 — `CLAUDE.md` 참조.

---

## 먼저 읽을 것

| 파일 | 무엇 |
|---|---|
| **[docs/HANDOFF.md](docs/HANDOFF.md)** | **새 작업을 시작한다면 여기부터.** 지금 상태 · 다음 할 일 · 밟으면 안 되는 지뢰 |
| [CLAUDE.md](CLAUDE.md) | 확정된 결정과 **그 이유.** 되묻지 말라고 적어둔 것들 |
| [docs/00_PROJECT_CURRENT.md](docs/00_PROJECT_CURRENT.md) | 공식 진행 상태 (STEP·Gate) |
| [docs/deliverables/21_화면명세.md](docs/deliverables/21_화면명세.md) | 화면·상태·이동 기준 + **§1-b 숫자 정본** |
| [docs/배포.md](docs/배포.md) | 사장님이 눌러야 하는 배포 순서 |
| [docs/day-flow.md](docs/day-flow.md) | 카페·베이커리 하루 흐름. 시드의 원본 |

**숫자(항목 수·레시피 수·촬영 대상 수)는 `21_화면명세.md` §1-b 한 곳에만 적는다.**
`tests/seed.test.ts` 의 "★ 숫자 정본" 테스트가 그 값을 못 박는다 — 시드를 고치면 깨지고,
깨지면 표를 같이 고치라는 뜻이다. **다른 문서에 숫자를 다시 적지 말 것.**

---

## 이 저장소의 규율

- **런타임 의존성은 3개다** — `next` · `react` · `react-dom`. AI 도 SDK 없이 REST(`fetch`)로 부른다.
  차트·UI 라이브러리를 넣지 않는다.
- **저장소는 비공개다.** 레시피가 영업비밀이다.
- **`presentation/매장수첩.html` 은 오프라인 단일 파일 시연본이다.**
  Next 앱을 고치면 **같이 고쳐야 한다** — `tests/singleFile.test.ts` 가 확인한다.
  그 파일의 규율은 **외부 요청 0건**이라 AI 기능은 거기 없다.
- **매장의 하루는 새벽 4시에 바뀐다.** 하루 단위 화면은 `businessDay()` 를 쓴다. 달력 날짜 금지.
- **모르는 숫자를 앱이 단정하지 않는다.** 주기 점검의 `everyDays` 가 전부 `null` 인 이유다 —
  제빙기를 매일 닦는 매장에 "1개월마다" 를 띄우면 그 화면은 처음부터 틀린 말을 한다.

---

## 구조

```
data/seed.json              ← 지금은 이 파일이 DB (카페·베이커리. 매장명·레시피 수치는 플레이스홀더)
data/events.jsonl           ← 지표. git 제외
src/lib/repo.ts             ← 데이터 접근. Supabase 갈 때 여기만 고침
src/lib/businessDay.ts      ← ★ 매장의 하루. 경계는 자정이 아니라 새벽 4시
src/lib/cycleDone.ts        ← ★ 주기 점검의 마지막으로 한 날 + 매장이 정한 주기
src/lib/shootPlan.ts        ← ★ AI 응답 거르기. 프롬프트보다 여기가 위험하다
src/app/api/shoot-plan/     ← ★ 유일한 AI 호출. 키는 서버에만
presentation/매장수첩.html   ← 오프라인 단일 파일 시연본 (외부 요청 0건)
tests/                      ← 425개
```

전체 목록과 각 파일에서 조심할 것은 [CLAUDE.md](CLAUDE.md) 「구조」 절에 있다.

---

## 아직 안 된 것 (숨기지 않는다)

| 무엇 | 상태 |
|---|---|
| **배포** | ⛔ 아직 안 함. D-007 은 "배포한다" 로 확정됐고 게이트는 다 닫혔다 → [docs/배포.md](docs/배포.md) |
| **사진·영상** | ⛔ **0장.** 핵심 가치 셋 중 하나인데 실사가 하나도 없다. `/shoot` 에 찍을 목록이 다 나온다 |
| **데이터베이스** | ⛔ localStorage. 태블릿에서 넣은 출퇴근이 폰에서 안 보인다. Supabase 는 배포 뒤 |
| **잠금** | 🟠 PIN 은 **접근 통제가 아니라 가림막**이다. 서버가 HTML 에 재료를 실어 보낸다 |
| **실증 매장** | ⛔ 0곳. 기능은 늘었는데 매장에서 검증된 것은 아직 없다 |
| **B4 — 점주가 왜 돈을 내는가** | ⛔ **하나도 안 풀렸다.** 화면을 만든 것이 지불 의사의 근거는 아니다 |

---

## 환경변수

`.env.local` (git 제외) 또는 배포처 설정에 넣는다. 예시는 [.env.example](.env.example).

| Key | 없으면 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | 카카오톡 미리보기가 안 뜬다. **빌드 시점에 박힌다** |
| `ANTHROPIC_API_KEY` | `/shoot` 의 **찍을 목록 만들기**만 "키가 없습니다" 로 뜬다. 나머지는 그대로 돈다 |

⚠️ **`ANTHROPIC_API_KEY` 에 `NEXT_PUBLIC_` 을 붙이면 안 된다.** 브라우저 번들에 키가 박힌다.

⚠️ **Vercel 은 파일 쓰기가 막혀 있어 `data/events.jsonl` 기록이 배포본에서 동작하지 않는다.**
지금은 조용히 버려지기만 한다. 지표를 실제로 모으려면 Supabase 가 먼저다.
