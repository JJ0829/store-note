import type { Metadata } from "next";
import { Suspense } from "react";
import LocalRecipeView from "@/components/LocalRecipeView";
import { getStore } from "@/lib/repo";

export const metadata: Metadata = {
  title: "레시피",
  robots: { index: false, follow: false },
};

/**
 * 매장에서 직접 추가한 레시피를 보는 화면.
 *
 * 시드 레시피(/r/[slug])는 빌드 때 주소가 정해지지만, 직접 추가한 것은
 * 브라우저에만 있으므로 주소를 미리 만들 수 없다. 그래서 ?id= 로 받는다.
 */
export default function MyRecipePage() {
  return (
    <Suspense fallback={null}>
      <LocalRecipeView storeName={getStore().name} />
    </Suspense>
  );
}
