import {
  MAX_BYTES,
  isStoredName,
  listMedia,
  openUpload,
  removeMedia,
  safeName,
  siblingNames,
  where,
  writeLocal,
  type Slot,
} from "@/lib/mediaStore";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 촬영 사진·영상.
 *
 * ★ 2026-09-13 — 보관함이 **서버 폴더에서 Supabase Storage 로** 옮겨졌다.
 *   어디에 쌓이는지는 `src/lib/mediaStore.ts` 가 정하고, 이 파일은 그걸
 *   화면에 열어주기만 한다.
 *
 * GET     들어와 있는 것 + 볼 수 있는 주소 (서명됨, 1시간)
 * POST    올릴 자리를 연다 — 파일은 **여기로 안 온다** (본문 한도 4.5MB)
 * PUT     폴더 갈래에서만. 파일을 받아서 직접 쓴다
 * DELETE  잘못 찍은 것 지우기
 * ------------------------------------------------------------------ */

export async function GET() {
  return Response.json({ files: await listMedia(), where: where() });
}

/**
 * 올릴 자리를 연다.
 *
 * 파일이 아니라 **이름만** 받는다. Supabase 갈래에서는 서명된 주소를 돌려주고
 * 브라우저가 거기로 바로 올린다 — 우리를 거치면 배포처의 본문 한도(4.5MB)에
 * 걸려서 영상이 **절대 못 올라간다.**
 */
export async function POST(req: Request) {
  let body: { base?: string; slot?: string; ext?: string; size?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "요청을 못 읽었습니다" }, { status: 400 });
  }

  const name = safeName(String(body.base ?? ""), body.slot as Slot, String(body.ext ?? ""));
  if (!name)
    return Response.json(
      {
        ok: false,
        reason: `이 파일은 못 넣습니다 — 확장자(.${body.ext ?? ""}) 또는 항목 이름이 맞지 않습니다`,
      },
      { status: 400 },
    );

  if (typeof body.size === "number" && body.size > MAX_BYTES)
    return Response.json(
      {
        ok: false,
        reason: `파일이 너무 큽니다 (${Math.round(body.size / 1e6)}MB · 최대 50MB)`,
      },
      { status: 413 },
    );

  /* ★ 같은 자리의 옛 파일을 **먼저** 치운다. 확장자가 다르면(jpg → png)
     두 장이 남고, 화면은 그중 하나만 보여주므로 지운 줄 알았던 것이 계속
     보관함에 남는다. 실패는 무시한다 — 없는 파일을 지우는 경우가 대부분이다. */
  await Promise.all(
    siblingNames(String(body.base), body.slot as Slot)
      .filter((n) => n !== name)
      .map((n) => removeMedia(n).catch(() => false)),
  );

  const ticket = await openUpload(name);
  if (!ticket)
    return Response.json(
      {
        ok: false,
        reason:
          "보관함을 열지 못했습니다. 배포처의 SUPABASE_URL · SUPABASE_ANON_KEY 를 확인해 주세요.",
      },
      { status: 502 },
    );

  return Response.json({ ok: true, ...ticket });
}

/**
 * 폴더 갈래에서만 온다 (`npm run dev` 에 환경변수가 없을 때).
 *
 * ⚠️ 배포본은 여기 오면 실패한다 — 폴더가 읽기 전용이다. 그래서 실패를
 *   숨기지 않고 이유를 말한다. 조용히 넘어가면 사장님은 넣은 줄 알고
 *   발표장에서 회색 네모를 본다.
 */
export async function PUT(req: Request) {
  if (where() !== "folder")
    return Response.json(
      { ok: false, reason: "이 서버는 보관함에 바로 올립니다 (이 길은 안 씁니다)" },
      { status: 409 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, reason: "파일을 못 읽었습니다" }, { status: 400 });
  }

  const file = form.get("file");
  const name = safeName(
    String(form.get("base") ?? ""),
    String(form.get("slot") ?? "") as Slot,
    String(form.get("ext") ?? ""),
  );
  if (!(file instanceof File))
    return Response.json({ ok: false, reason: "파일이 없습니다" }, { status: 400 });
  if (!name)
    return Response.json({ ok: false, reason: "이 파일은 못 넣습니다" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json(
      { ok: false, reason: `파일이 너무 큽니다 (${Math.round(file.size / 1e6)}MB · 최대 50MB)` },
      { status: 413 },
    );

  try {
    await writeLocal(name, new Uint8Array(await file.arrayBuffer()));
    return Response.json({ ok: true, name });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        reason:
          "이 서버에는 파일을 저장할 수 없습니다 — 폴더가 읽기 전용입니다. " +
          "배포처에 SUPABASE_URL · SUPABASE_ANON_KEY 를 넣으면 보관함으로 올라갑니다.",
        detail: String(e),
      },
      { status: 500 },
    );
  }
}

/** 잘못 찍은 것을 지운다. 이름은 목록(GET)에서 받은 모양만 받는다 */
export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!isStoredName(name))
    return Response.json({ ok: false, reason: "이름이 잘못됐습니다" }, { status: 400 });
  const ok = await removeMedia(name);
  return ok
    ? Response.json({ ok: true, name })
    : Response.json({ ok: false, reason: "지우지 못했습니다" }, { status: 500 });
}
