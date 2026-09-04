import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import ContractView from "@/components/ContractView";
import { getStore } from "@/lib/repo";

export const metadata: Metadata = {
  title: "근로계약서",
  robots: { index: false, follow: false },
};

export default function ContractsPage() {
  return (
    <OwnerGate title="근로계약서">
      <ContractView storeName={getStore().name} />
    </OwnerGate>
  );
}
