import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * `public/media/` 안에 어떤 파일이 들어와 있는지 한 번에 알려준다.
 *
 * 처음에는 화면에서 파일마다 있는지 물어봤는데(항목 48개 × 확장자 11개),
 * 요청이 500개 넘게 나가서 개발 서버가 멈췄다. 목록은 한 번만 받으면 된다.
 */
export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "media");
    const names = await fs.readdir(dir);
    const files = names.filter((n) => !n.startsWith(".") && !n.endsWith(".md"));
    return Response.json({ files });
  } catch {
    // 폴더가 아직 없으면 빈 목록으로 둔다
    return Response.json({ files: [] });
  }
}
