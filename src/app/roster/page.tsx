import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import RosterView from "@/components/RosterView";
import { getStore, listShifts } from "@/lib/repo";

export const metadata: Metadata = {
  title: "근무표",
  robots: { index: false, follow: false },
};

export default function RosterPage() {
  return (
    <OwnerGate title="근무표">
      <RosterView shifts={listShifts()} storeName={getStore().name} />
    </OwnerGate>
  );
}
