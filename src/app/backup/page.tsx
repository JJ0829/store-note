import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import BackupView from "@/components/BackupView";
import { getStore, listPrepLists } from "@/lib/repo";

export const metadata: Metadata = {
  title: "내보내기 · 되돌리기",
  robots: { index: false, follow: false },
};

export default function BackupPage() {
  /* 점검 기록은 저장소(태블릿)에 있고 항목 이름은 시드에 있다.
     내보낸 CSV 에 id 만 적히면 무엇을 점검한 기록인지 알 수 없어
     증빙으로 못 쓴다. 그래서 이름표를 서버에서 만들어 넘긴다. */
  const labels: Record<string, { title: string; group: string }> = {};
  for (const list of listPrepLists()) {
    const groupOf = new Map(list.tasks.map((t) => [t.id, t.title]));
    for (const t of list.tasks) {
      if (t.trigger.type !== "cycle") continue;
      labels[t.id] = {
        title: t.title,
        group: t.optionOf ? (groupOf.get(t.optionOf) ?? "") : "",
      };
    }
  }

  return (
    <OwnerGate title="내보내기 · 되돌리기">
      <BackupView storeName={getStore().name} cycleLabels={labels} />
    </OwnerGate>
  );
}
