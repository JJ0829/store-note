import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChecklistView from "@/components/ChecklistView";
import { countTasks, getPositionBySlug, getStore, listPositions } from "@/lib/repo";

type Params = { slug: string };

// 링크 3개뿐이라 미리 다 만들어둔다 (카톡에서 눌렀을 때 바로 뜨게)
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
  if (!position) return { title: "체크리스트를 찾을 수 없습니다" };

  const store = getStore();
  const title = `${position.name} ${position.subtitle}`;
  const description = `${store.name} · 총 ${countTasks(position)}개 항목. 순서대로 따라 하시면 됩니다.`;

  // 카카오톡 미리보기는 og 태그를 읽는다. 절대 URL이 필요해서 환경변수를 쓴다.
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${base}/p/${position.shareSlug}`,
      siteName: store.name,
      locale: "ko_KR",
      type: "article",
    },
  };
}

export default async function PositionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const position = getPositionBySlug(slug);
  if (!position) notFound();

  return <ChecklistView position={position} storeName={getStore().name} />;
}
