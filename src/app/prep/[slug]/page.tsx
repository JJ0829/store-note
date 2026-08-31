import { notFound } from "next/navigation";
import PrepView from "@/components/PrepView";
import { getPrepListBySlug, getStore, listPrepLists, listRecipes } from "@/lib/repo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listPrepLists().map((p) => ({ slug: p.slug }));
}

export default async function PrepPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const list = getPrepListBySlug(slug);
  if (!list) notFound();

  return (
    <PrepView list={list} recipes={listRecipes()} storeName={getStore().name} />
  );
}
