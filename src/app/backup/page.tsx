import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import BackupView from "@/components/BackupView";
import { getStore } from "@/lib/repo";

export const metadata: Metadata = {
  title: "내보내기 · 되돌리기",
  robots: { index: false, follow: false },
};

export default function BackupPage() {
  return (
    <OwnerGate title="내보내기 · 되돌리기">
      <BackupView storeName={getStore().name} />
    </OwnerGate>
  );
}
