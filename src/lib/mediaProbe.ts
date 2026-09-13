/* ------------------------------------------------------------------ *
 * 사진·영상이 실제로 들어와 있는지 확인한다.
 *
 * 데이터에 경로를 적어두지 않기로 했다. 그러면 촬영해 올 때마다 JSON을
 * 고쳐야 하고, 결국 아무도 안 채운다. 대신 **정해진 이름**으로 넣으면 알아서 붙는다.
 *
 * ★ 2026-09-13 — 보관함이 Supabase Storage 로 옮겨지면서 **주소를 우리가 만들지
 *   않는다.** 버킷이 공개가 아니라 주소가 **서명되어 있고 한 시간 뒤 만료된다.**
 *   그래서 이름만 받아 `/media/{이름}` 을 조립하던 것을 그만두고,
 *   `/api/media` 가 주는 **주소를 그대로 쓴다.**
 *
 * 처음에는 파일마다 있는지 물어봤는데(항목 48개 × 확장자 11개) 요청이
 * 500개 넘게 나가서 개발 서버가 멈췄다. 그래서 폴더 목록을 딱 한 번 받아
 * 그 안에서 이름을 찾는다.
 * ------------------------------------------------------------------ */

const IMG_EXT = ["jpg", "jpeg", "png", "webp", "heic"];
const VID_EXT = ["mp4", "mov", "webm", "m4v"];

export type Found = {
  good?: string;
  bad?: string;
  video?: string;
};

/** 이 항목에 넣어야 하는 파일명. 촬영 화면에 그대로 보여준다. */
export function expectedNames(base: string) {
  return {
    good: `${base}-good.jpg`,
    bad: `${base}-bad.jpg`,
    video: `${base}.mp4`,
  };
}

/** 목록은 한 번만 받는다. 여러 컴포넌트가 동시에 불러도 요청은 하나다. */
let manifest: Promise<Map<string, string>> | null = null;

type Row = string | { name?: string; url?: string };

/** 지금 어디에 쌓이는가. 목록을 받을 때 같이 온다 — 요청을 하나 더 안 만든다 */
let whereNow: "supabase" | "folder" | null = null;
export function storedWhere() {
  return whereNow;
}

function load(): Promise<Map<string, string>> {
  manifest ??= fetch("/api/media")
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .then((d: { files?: Row[]; where?: "supabase" | "folder" }) => {
      whereNow = d.where ?? null;
      const m = new Map<string, string>();
      for (const row of d.files ?? []) {
        /* 옛 모양(이름만)도 받는다 — 폴더 갈래로 돌던 배포본이 남아 있을 수 있다 */
        if (typeof row === "string") m.set(row, `/media/${row}`);
        else if (row?.name) m.set(row.name, row.url ?? `/media/${row.name}`);
      }
      return m;
    })
    .catch(() => new Map<string, string>());
  return manifest;
}

/** 촬영해서 새로 넣은 뒤 다시 읽게 한다 */
export function forget() {
  manifest = null;
}

function pick(files: Map<string, string>, base: string, exts: string[]): string | undefined {
  for (const e of exts) {
    const url = files.get(`${base}.${e}`);
    if (url) return url;
  }
  return undefined;
}

export async function probe(base: string): Promise<Found> {
  const files = await load();
  return {
    good: pick(files, `${base}-good`, IMG_EXT),
    bad: pick(files, `${base}-bad`, IMG_EXT),
    video: pick(files, base, VID_EXT),
  };
}

/** 여러 항목을 한 번에. 촬영 진행 화면이 쓴다. */
export async function probeAll(bases: string[]): Promise<Map<string, Found>> {
  const files = await load();
  const out = new Map<string, Found>();
  for (const b of bases) {
    out.set(b, {
      good: pick(files, `${b}-good`, IMG_EXT),
      bad: pick(files, `${b}-bad`, IMG_EXT),
      video: pick(files, b, VID_EXT),
    });
  }
  return out;
}

/**
 * 주소에서 파일 이름만 뽑는다 — 지우기가 쓴다.
 *
 * ★ 2026-09-13 에 여기서 한 번 걸렸다. 보관함을 Supabase 로 옮기면서 주소가
 *   **서명된 것**이 됐는데(`.../t-open-5-good.png?token=eyJ...`),
 *   `url.split("/").pop()` 을 그대로 쓰고 있어서 이름에 `?token=...` 이
 *   통째로 붙었다. 서버는 그 이름을 거절하고, 화면은 지운 줄 알고 넘어간다 —
 *   **누르면 아무 일도 안 일어나는데 아무도 모르는** 종류의 결함이다.
 */
export function nameFromUrl(url: string): string {
  return (url.split("?")[0].split("/").pop() ?? "").trim();
}

export function hasAny(f: Found | null): boolean {
  return !!f && (!!f.good || !!f.bad || !!f.video);
}
