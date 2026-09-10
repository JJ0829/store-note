import { notFound } from "next/navigation";
import PrepView from "@/components/PrepView";
import ServerStoreGate from "@/components/ServerStoreGate";
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

  /* ★ 매장 PIN 으로 가린다 (2026-09-10).
 *
 *  전에는 이 화면만 잠금이 없었다. 목록(`/prep`)에는 게이트가 있는데
 *  정작 **레시피를 보여주는 상세**가 열려 있었다.
 *
 *  왜 그랬나 — 결정 당시에는 맞았다. `/prep` 의 게이트는 *레시피 목록을
 *  훑는 것*을 막으려던 것이고, 프렙 상세는 그냥 할 일 목록이었다.
 *  그 뒤 **프렙 안에 레시피를 통째로 합치면서**(만드는 순서까지) 전제가
 *  깨졌는데 게이트를 같이 옮기지 않았다. 실측: 잠금 없이 연
 *  `/prep/afternoon` 의 HTML 에 식빵 배합(강력분 100% 2000g)이 그대로 있었다.
 *
 *  드나드는 데 불편이 늘지는 않는다 — 탭바는 이미 잠긴 `/prep` 을 거친다.
 *  이 게이트가 닫는 것은 **주소를 직접 친 경우**다.
 *
 *  ⚠️ 그래도 가림막이다. 서버는 여전히 하이드레이션용 페이로드에 레시피를
 *  실어 보낸다 — `tests/builtPages.test.ts` 가 그 사실을 붙들고 있다. */
  return (
    <ServerStoreGate title={list.name}>
      <PrepView list={list} recipes={listRecipes()} storeName={getStore().name} />
    </ServerStoreGate>
  );
}
