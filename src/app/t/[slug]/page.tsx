import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrainingMode from "@/components/TrainingMode";
import { getPositionBySlug, getStore, listPositions } from "@/lib/repo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listPositions().map((p) => ({ slug: p.shareSlug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const position = getPositionBySlug(slug);
  if (!position) return { title: "교육 자료를 찾을 수 없습니다" };
  return { title: `${position.name} 교육 · ${getStore().name}` };
}

export default async function TrainingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const position = getPositionBySlug(slug);
  if (!position) notFound();

  return <TrainingMode position={position} storeName={getStore().name} />;
}
