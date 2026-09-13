/* ------------------------------------------------------------------ *
 * 촬영 사진·영상을 어디에 두는가.
 *
 * ★ 2026-09-13 — **서버 폴더에서 Supabase Storage 로 옮겼다.**
 *
 *   전에는 `public/media/` 에 직접 썼다. 로컬에서는 됐지만 배포본(Vercel)은
 *   폴더가 읽기 전용이라 **안 된다.** 그래서 사장님이 사진을 넣으려면
 *   «컴퓨터에서 앱 띄우기 → 찍어 넣기 → 커밋 → 배포» 를 해야 했다.
 *   매장에서 폰으로 찍는 도구인데 그 동선이 막혀 있으면 **촬영은 영영
 *   0장으로 남는다** — 실제로 91개 중 0개였다.
 *
 *   이제 **매장에서 폰으로 배포 주소를 열고 찍으면 끝**이다.
 *
 * ★ 두 갈래로 둔다 — 환경변수가 없으면 예전처럼 폴더에 쓴다.
 *   `npm run dev` 를 처음 받아서 그냥 띄운 사람에게 «설정부터 하세요» 를
 *   띄우면 거기서 멈춘다. 이 저장소는 그 규율을 계속 지켜 왔다
 *   (`/api/log` 의 `sink`, `STORE_PIN` 없을 때의 빨간 띠).
 *   **어느 쪽으로 갔는지는 숨기지 않고 `where` 로 돌려준다.**
 * ------------------------------------------------------------------ */

import fs from "node:fs/promises";
import path from "node:path";

/** 넣을 수 있는 확장자. 폰 카메라가 내놓는 것들이다 */
export const IMG_EXT = ["jpg", "jpeg", "png", "webp", "heic"] as const;
export const VID_EXT = ["mp4", "mov", "webm", "m4v"] as const;

/** 한 파일 50MB. 30초짜리 폰 영상이 보통 30~60MB 다 (버킷도 같은 값으로 막는다) */
export const MAX_BYTES = 50 * 1024 * 1024;

export type Slot = "good" | "bad" | "video";
export const SLOTS: Slot[] = ["good", "bad", "video"];

export const LOCAL_DIR = path.join(process.cwd(), "public", "media");
const BUCKET = "media";

/**
 * 넣을 파일 이름을 만든다.
 *
 * ★ 여기서 **경로를 못 벗어나게** 막는다. `base` 는 화면이 보내는 항목 id 인데,
 *   그대로 믿고 이어붙이면 `../../` 같은 것이 들어와 엉뚱한 곳에 쓴다.
 *
 * ★ 걸러낸 뒤가 원래와 다르면 **거절한다.** 조용히 고쳐서 넣으면
 *   `../../evil` 이 `evil` 로 바뀌어 저장되고, 보관함에 아무도 모르는 파일이
 *   쌓인다. **경로를 못 벗어나는 것**과 **이상한 것을 안 받는 것**은 다른 일이다.
 */
export function safeName(base: string, slot: Slot, ext: string): string | null {
  const raw = String(base).toLowerCase();
  const b = raw.replace(/[^a-z0-9-]/g, "");
  const e = String(ext).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!b || b.length > 60 || b !== raw) return null;
  if (!SLOTS.includes(slot)) return null;
  const ok: readonly string[] = slot === "video" ? VID_EXT : IMG_EXT;
  if (!ok.includes(e)) return null;
  return slot === "video" ? `${b}.${e}` : `${b}-${slot}.${e}`;
}

/** 목록(GET)에서 받은 이름만 다시 받는다 — 지우기에 쓴다 */
export function isStoredName(name: string): boolean {
  return /^[a-z0-9-]+\.[a-z0-9]+$/i.test(name);
}

/** 같은 자리에 이미 다른 확장자로 들어와 있으면 지운다 (두 장이 남지 않게) */
export function siblingNames(base: string, slot: Slot): string[] {
  const b = base.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const exts: readonly string[] = slot === "video" ? VID_EXT : IMG_EXT;
  const stem = slot === "video" ? b : `${b}-${slot}`;
  return exts.map((e) => `${stem}.${e}`);
}

/* ------------------------------------------------------------------ *
 * Supabase Storage
 * ------------------------------------------------------------------ */

function conf(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

/** 지금 어디에 쌓이는가. 화면이 이걸 그대로 보여준다 — 숨기면 못 고친다 */
export type Where = "supabase" | "folder";
export function where(): Where {
  return conf() ? "supabase" : "folder";
}

function headers(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export type MediaFile = { name: string; url: string };

/**
 * 들어와 있는 파일 전부 + 볼 수 있는 주소.
 *
 * ★ 주소는 **서명된 것**이고 한 시간 뒤 만료된다. 버킷이 공개가 아니라서
 *   그렇다 — 공개로 두면 `.../media/t-open-5-good.jpg` 처럼 **이름이 뻔한
 *   주소**가 영구히 열리고, 항목 id 는 화면에 그대로 적혀 있어 추측이 쉽다.
 *   레시피를 서버가 막아둔 것과 앞뒤가 안 맞는다.
 *
 * ★ 서명은 **한 번에 묶어서** 받는다. 파일마다 부르면 91×3 번이 나간다 —
 *   예전에 폴더를 파일마다 물어봤다가 개발 서버가 멈춘 적이 있다.
 */
export async function listMedia(): Promise<MediaFile[]> {
  const c = conf();
  if (!c) {
    try {
      const names = (await fs.readdir(LOCAL_DIR)).filter(
        (n) => !n.startsWith(".") && !n.endsWith(".md"),
      );
      return names.map((name) => ({ name, url: `/media/${name}` }));
    } catch {
      return []; // 폴더가 아직 없으면 빈 목록
    }
  }

  const listed = await fetch(`${c.url}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...headers(c.key), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000, offset: 0 }),
    cache: "no-store",
  });
  if (!listed.ok) return [];

  const rows = (await listed.json()) as Array<{ name?: string }>;
  const names = rows
    .map((r) => r?.name)
    .filter((n): n is string => !!n && !n.endsWith(".md") && !n.startsWith("."));
  if (names.length === 0) return [];

  const signed = await fetch(`${c.url}/storage/v1/object/sign/${BUCKET}`, {
    method: "POST",
    headers: { ...headers(c.key), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600, paths: names }),
    cache: "no-store",
  });
  if (!signed.ok) return [];

  const out = (await signed.json()) as Array<{ path?: string; signedURL?: string }>;
  return out
    .filter((r) => r.path && r.signedURL)
    .map((r) => ({ name: r.path as string, url: `${c.url}/storage/v1${r.signedURL}` }));
}

/**
 * 올릴 자리를 연다.
 *
 * ★ 파일 자체를 **우리 서버로 안 보낸다.** 배포처(Vercel)의 요청 본문 한도가
 *   4.5MB 라, 30~60MB 짜리 폰 영상은 우리를 거쳐서는 **절대 못 올라간다.**
 *   그래서 서명된 주소를 받아서 **브라우저가 Supabase 로 바로 올린다.**
 *   (폴더 갈래에서는 한도가 없으므로 예전처럼 우리가 받는다)
 */
export type UploadTicket =
  | { mode: "direct"; name: string; url: string }
  | { mode: "local"; name: string };

export async function openUpload(name: string): Promise<UploadTicket | null> {
  const c = conf();
  if (!c) return { mode: "local", name };

  // 같은 자리의 옛 파일은 미리 치운다 — 확장자가 다르면 두 장이 남는다
  const r = await fetch(
    `${c.url}/storage/v1/object/upload/sign/${BUCKET}/${encodeURIComponent(name)}`,
    { method: "POST", headers: headers(c.key), cache: "no-store" },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { url?: string };
  if (!j.url) return null;
  return { mode: "direct", name, url: `${c.url}/storage/v1${j.url}` };
}

export async function removeMedia(name: string): Promise<boolean> {
  const c = conf();
  if (!c) {
    try {
      await fs.rm(path.join(LOCAL_DIR, name), { force: true });
      return true;
    } catch {
      return false;
    }
  }
  const r = await fetch(
    `${c.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`,
    { method: "DELETE", headers: headers(c.key) },
  );
  // 없는 파일을 지우라고 해도 성공으로 본다 — 화면은 이미 없어진 것으로 본다
  return r.ok || r.status === 404;
}

/** 폴더 갈래에서만 쓴다. 배포본은 여기 못 온다(읽기 전용) */
export async function writeLocal(name: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), bytes);
}
