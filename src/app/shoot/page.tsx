import type { Metadata } from "next";
import ShootBoard, { type ShootItem } from "@/components/ShootBoard";
import { getStore, listPositions, listPrepLists, listRecipes } from "@/lib/repo";

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

export default function ShootPage() {
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

  for (const l of listPrepLists())
    for (const t of l.tasks)
      items.push({
        id: t.id,
        title: t.title,
        group: `${l.name} · 프렙`,
        critical: t.critical,
        priority: PRIORITY[t.id],
      });

  return <ShootBoard items={items} storeName={getStore().name} />;
}
