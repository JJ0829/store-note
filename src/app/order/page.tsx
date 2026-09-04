import type { Metadata } from "next";
import OrderView from "@/components/OrderView";
import { getStore, listPrepLists } from "@/lib/repo";

export const metadata: Metadata = {
  title: "발주",
  robots: { index: false, follow: false },
};

/**
 * 발주는 잠그지 않는다.
 *
 * 아침에 "어제 주문한 게 들어왔나"를 확인하는 건 직원이 한다.
 * 단가는 이 화면에 나오지 않으므로 잠글 이유도 없다.
 */
export default function OrderPage() {
  return <OrderView storeName={getStore().name} prepLists={listPrepLists()} />;
}
