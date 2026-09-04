import type { Metadata } from "next";
import OwnerGate from "@/components/OwnerGate";
import VendorView from "@/components/VendorView";
import { getStore, listRecipes } from "@/lib/repo";

export const metadata: Metadata = {
  title: "거래처",
  robots: { index: false, follow: false },
};

export default function VendorsPage() {
  // 레시피에 나오는 재료 이름을 모아 넘긴다. 이 이름과 품목 이름이
  // 같아야 원가가 붙으므로, 사장님이 직접 타이핑하지 않게 골라주는 것이다.
  const names = [
    ...new Set(
      listRecipes().flatMap((r) => r.ingredients.map((i) => i.name.trim())),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <OwnerGate title="거래처">
      <VendorView storeName={getStore().name} ingredientNames={names} />
    </OwnerGate>
  );
}
