import fs from "node:fs";
import path from "node:path";
import type { Position, SeedData, Store } from "./types";

/**
 * 지금은 data/seed.json 파일 하나가 DB 역할을 한다.
 *
 * 2단계에서 Supabase로 옮길 때는 이 파일 안의 함수 본문만
 * 쿼리로 바꾸면 되고, 페이지·컴포넌트 코드는 손댈 필요가 없다.
 */

let cache: SeedData | null = null;

function load(): SeedData {
  // 개발 중에는 seed.json을 고칠 때마다 바로 반영되도록 캐시하지 않는다.
  if (cache && process.env.NODE_ENV === "production") return cache;

  const file = path.join(process.cwd(), "data", "seed.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as SeedData;
  cache = parsed;
  return parsed;
}

export function getStore(): Store {
  return load().store;
}

export function listPositions(): Position[] {
  return load().positions;
}

export function getPositionBySlug(slug: string): Position | null {
  return load().positions.find((p) => p.shareSlug === slug) ?? null;
}

export function countTasks(position: Position): number {
  return position.sections.reduce((sum, s) => sum + s.tasks.length, 0);
}

export function countCritical(position: Position): number {
  return position.sections.reduce(
    (sum, s) => sum + s.tasks.filter((t) => t.critical).length,
    0,
  );
}
