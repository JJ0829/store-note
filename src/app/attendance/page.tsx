import type { Metadata } from "next";
import AttendanceView from "@/components/AttendanceView";
import { getStore, listShifts } from "@/lib/repo";

export const metadata: Metadata = {
  title: "출퇴근",
  robots: { index: false, follow: false },
};

/**
 * 출퇴근은 잠그지 않는다 — 직원이 직접 찍어야 하는 화면이다.
 * 대신 같은 화면 안의 시급·인건비만 따로 가린다 (InlineUnlock).
 */
export default function AttendancePage() {
  return <AttendanceView storeName={getStore().name} shifts={listShifts()} />;
}
