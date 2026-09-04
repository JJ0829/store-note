import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import SalesView from "@/components/SalesView";
import { getStore, listShifts } from "@/lib/repo";

export const metadata: Metadata = {
  title: "매출",
  robots: { index: false, follow: false },
};

export default function SalesPage() {
  return (
    <OwnerGate title="매출">
      <SalesView storeName={getStore().name} shifts={listShifts()} />
    </OwnerGate>
  );
}
