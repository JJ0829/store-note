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
    const files = (await fs.readdir(DIR)).filter(
      (n) => !n.startsWith(".") && !n.endsWith(".md"),
    );
    return Response.json({ files });
  } catch {
    // 폴더가 아직 없으면 빈 목록으로 둔다
    return Response.json({ files: [] });
  }
}

const DIR = path.join(process.cwd(), "public", "media");

/** 넣을 수 있는 확장자. 폰 카메라가 내놓는 것들이다 */
const IMG = ["jpg", "jpeg", "png", "webp", "heic"];
const VID = ["mp4", "mov", "webm", "m4v"];

/** 한 파일 50MB. 30초짜리 폰 영상이 보통 30~60MB 다 */
const MAX = 50 * 1024 * 1024;

type Slot = "good" | "bad" | "video";
const SLOTS: Slot[] = ["good", "bad", "video"];

/**
 * 넣을 파일 이름을 만든다.
 *
 * ★ 여기서 **경로를 못 벗어나게** 막는다. `base` 는 화면이 보내는 항목 id 인데,
 *   그대로 믿고 이어붙이면 `../../` 같은 것이 들어와 저장소 바깥에 쓴다.
 *   영숫자와 하이픈만 남기고, 확장자는 **목록에 있는 것만** 받는다.
 */
function safeName(base: string, slot: Slot, ext: string): string | null {
  const raw = String(base).toLowerCase();
  const b = raw.replace(/[^a-z0-9-]/g, "");
  const e = String(ext).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!b || b.length > 60) return null;
  /* ★ 걸러낸 뒤가 원래와 다르면 **거절한다.** 조용히 고쳐서 넣으면
     `../../evil` 이 `evil` 로 바뀌어 저장되고, 폴더에 아무도 모르는 파일이
     쌓인다. 경로를 못 벗어나는 것과, 이상한 것을 안 받는 것은 다른 일이다. */
  if (b !== raw) return null;
  const ok = slot === "video" ? VID : IMG;
  if (!ok.includes(e)) return null;
  return slot === "video" ? `${b}.${e}` : `${b}-${slot}.${e}`;
}

/** 같은 자리에 이미 다른 확장자로 들어와 있으면 지운다 (두 장이 남지 않게) */
async function removeSiblings(base: string, slot: Slot) {
  const b = base.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const exts = slot === "video" ? VID : IMG;
  const stem = slot === "video" ? b : `${b}-${slot}`;
  await Promise.all(
    exts.map((e) => fs.rm(path.join(DIR, `${stem}.${e}`), { force: true })),
  );
}

/**
 * 찍은 사진·영상을 넣는다.
 *
 * ⚠️ **서버의 파일 시스템에 쓴다.** 로컬(`npm run dev`)과 직접 띄운 서버에서는
 *   되지만, Vercel 같은 곳은 배포본 폴더가 읽기 전용이라 **안 된다.**
 *   그때는 실패를 숨기지 않고 화면이 이유를 말한다 — 조용히 넘어가면
 *   사장님은 넣은 줄 알고 발표장에서 회색 네모를 본다.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, reason: "파일을 못 읽었습니다" }, { status: 400 });
  }

  const file = form.get("file");
  const base = String(form.get("base") ?? "");
  const slot = String(form.get("slot") ?? "") as Slot;

  if (!(file instanceof File))
    return Response.json({ ok: false, reason: "파일이 없습니다" }, { status: 400 });
  if (!SLOTS.includes(slot))
    return Response.json({ ok: false, reason: "자리가 잘못됐습니다" }, { status: 400 });
  if (file.size > MAX)
    return Response.json(
      { ok: false, reason: `파일이 너무 큽니다 (${Math.round(file.size / 1e6)}MB · 최대 50MB)` },
      { status: 413 },
    );

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const name = safeName(base, slot, ext);
  if (!name)
    return Response.json(
      {
        ok: false,
        reason: `이 파일은 못 넣습니다 — 확장자(.${ext}) 또는 항목 이름이 맞지 않습니다`,
      },
      { status: 400 },
    );

  try {
    await fs.mkdir(DIR, { recursive: true });
    await removeSiblings(base, slot);
    await fs.writeFile(path.join(DIR, name), Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true, name });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        reason:
          "이 서버에는 파일을 저장할 수 없습니다. 배포본은 폴더가 읽기 전용입니다 — " +
          "지금은 내 컴퓨터에서 띄운 앱에서만 넣을 수 있습니다.",
        detail: String(e),
      },
      { status: 500 },
    );
  }
}

/** 잘못 찍은 것을 지운다. 파일 이름은 목록(GET)에서 받은 것만 받는다 */
export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  /* ★ 이름에 경로가 섞여 있으면 거절한다. `path.basename` 으로 자르는 것만으로는
     부족하다 — 무엇을 지웠는지 화면에 돌려줘야 하므로 그대로 쓸 이름만 받는다. */
  if (!/^[a-z0-9-]+\.[a-z0-9]+$/i.test(name))
    return Response.json({ ok: false, reason: "이름이 잘못됐습니다" }, { status: 400 });
  try {
    await fs.rm(path.join(DIR, name), { force: true });
    return Response.json({ ok: true, name });
  } catch (e) {
    return Response.json({ ok: false, reason: "지우지 못했습니다", detail: String(e) }, { status: 500 });
  }
}
