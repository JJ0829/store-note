import type { Metadata } from "next";
import RecipeForm from "@/components/RecipeForm";
import StoreGate from "@/components/StoreGate";
import { listRecipes } from "@/lib/repo";

export const metadata: Metadata = {
  title: "레시피 추가",
  robots: { index: false, follow: false },
};

export default function NewRecipePage() {
  // 이미 쓰고 있는 분류를 버튼으로 보여준다 (매번 타이핑하지 않게)
  const categories = [...new Set(listRecipes().map((r) => r.category))];
  return (
    <StoreGate title="레시피 추가">
      <RecipeForm categories={categories} />
    </StoreGate>
  );
}
