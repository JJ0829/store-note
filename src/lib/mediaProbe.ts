/* ------------------------------------------------------------------ *
 * 사진·영상이 실제로 들어와 있는지 확인한다.
 *
 * 데이터에 경로를 적어두지 않기로 했다. 그러면 촬영해 올 때마다 JSON을
 * 고쳐야 하고, 결국 아무도 안 채운다. 대신 `public/media/`에 정해진 이름으로
 * 넣으면 알아서 붙는다.
 *
 * 처음에는 파일마다 있는지 물어봤는데(항목 48개 × 확장자 11개) 요청이
 * 500개 넘게 나가서 개발 서버가 멈췄다. 그래서 폴더 목록을 딱 한 번 받아
 * 그 안에서 이름을 찾는다.
 * ------------------------------------------------------------------ */

const IMG_EXT = ["jpg", "jpeg", "png", "webp"];
const VID_EXT = ["mp4", "mov", "webm"];

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

/** 폴더 목록은 한 번만 받는다. 여러 컴포넌트가 동시에 불러도 요청은 하나다. */
let manifest: Promise<Set<string>> | null = null;

function load(): Promise<Set<string>> {
  manifest ??= fetch("/api/media")
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .then((d: { files?: string[] }) => new Set(d.files ?? []))
    .catch(() => new Set<string>());
  return manifest;
}

/** 촬영해서 새로 넣은 뒤 다시 읽게 한다 */
export function forget() {
  manifest = null;
}

function pick(files: Set<string>, base: string, exts: string[]): string | undefined {
  for (const e of exts) {
    const name = `${base}.${e}`;
    if (files.has(name)) return `/media/${name}`;
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

export function hasAny(f: Found | null): boolean {
  return !!f && (!!f.good || !!f.bad || !!f.video);
}
