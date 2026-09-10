import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RecipeDetail from "@/components/RecipeDetail";
import ServerStoreGate from "@/components/ServerStoreGate";
import { getRecipeBySlug, getStore, listRecipes } from "@/lib/repo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listRecipes().map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recipe = getRecipeBySlug(slug);
  // 영업비밀이므로 검색 노출을 막는다
  return {
    title: recipe ? recipe.name : "레시피",
    robots: { index: false, follow: false },
  };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const recipe = getRecipeBySlug(slug);
  if (!recipe) notFound();

  return (
    <ServerStoreGate title={recipe.name}>
      <RecipeDetail recipe={recipe} storeName={getStore().name} />
    </ServerStoreGate>
  );
}
