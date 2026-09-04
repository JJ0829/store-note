import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import CostView from "@/components/CostView";
import { getStore, listRecipes } from "@/lib/repo";

export const metadata: Metadata = {
  title: "원가",
  robots: { index: false, follow: false },
};

export default function CostPage() {
  return (
    <OwnerGate title="원가">
      <CostView storeName={getStore().name} seedRecipes={listRecipes()} />
    </OwnerGate>
  );
}
