import type { Metadata } from "next";
import ShootBoard, { type ShootItem } from "@/components/ShootBoard";
import ServerStoreGate from "@/components/ServerStoreGate";
import {
  filmableTasks,
  getStore,
  listPositions,
  listPrepLists,
  listRecipes,
} from "@/lib/repo";

export const metadata: Metadata = {
  title: "촬영 진행",
  robots: { index: false, follow: false },
};

/**
 * 기준이 사람마다 가장 갈리는 항목.
 * docs/day-flow.md의 "영상으로 박제할 1순위"에서 그대로 가져왔다.
 */
const PRIORITY: Record<string, string> = {
  "t-open-5": "추출 테스트 합격 기준",
  "s-lt-2": "스팀 밀크 온도·거품",
  "t-bake-1": "르방·발효 완료 판단",
  "p-1": "콜드브루 거는 장면",
};

export default async function ShootPage() {
  const items: ShootItem[] = [];

  for (const p of listPositions())
    for (const s of p.sections)
      for (const st of s.steps)
        items.push({
          id: st.id,
          title: st.title,
          group: `${p.name} · 포지션`,
          critical: st.critical,
          priority: PRIORITY[st.id],
        });

  for (const r of listRecipes())
    for (const s of r.sections)
      for (const st of s.steps)
        items.push({
          id: st.id,
          title: st.title,
          group: `${r.name} · 레시피`,
          critical: st.critical,
          priority: PRIORITY[st.id],
        });

  /* ★ `l.tasks` 를 그대로 돌면 안 된다 — 「묶음 머리」 3개가 섞여 들어온다.
   *   `기계 · 설비 점검` 같은 것은 **이름표라 찍을 장면이 없는데** 목록에 서고
   *   촬영 대상 수를 부풀린다. 옵션은 반대로 **찍을 수 있으니 그대로 센다**
   *   — 규칙과 그 이유는 `repo.filmableTasks()` 에 있다. */
  for (const l of listPrepLists())
    for (const t of filmableTasks(l))
      items.push({
        id: t.id,
        title: t.title,
        group: `${l.name} · 프렙`,
        critical: t.critical,
        priority: PRIORITY[t.id],
      });

  /* ★ 매장 PIN 뒤로 넣는다 (2026-09-10).
   *
   *  두 가지 때문이다.
   *  ① 이 화면이 **레시피 이름 10개와 만드는 순서를 통째로** 보여준다.
   *     배합 수치는 없지만 순서는 다 보인다 — 잠금 없이 열려 있었다.
   *  ② **AI 입력칸이 여기 있다.** 그게 이 앱에서 돈이 나가는 유일한
   *     경로다. 화면을 잠그면 그 입력칸도 같이 잠긴다
   *     (`/api/shoot-plan` 도 서버에서 같은 쿠키를 요구한다). */
  return (
    <ServerStoreGate title="촬영 진행">
      <ShootBoard items={items} storeName={getStore().name} />
    </ServerStoreGate>
  );
}
