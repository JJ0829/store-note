"use client";

import { useEffect, useRef, useState } from "react";
import { BTN, BTN_PRIMARY, Card, Caveat, Row, Screen } from "@/components/ui";
import {
  applyRestore,
  backupCounts,
  buildBackup,
  markBackedUp,
  checkRestore,
  contractRows,
  cycleRows,
  punchRows,
  toCsv,
  today,
  type BackupFile,
} from "@/lib/backup";
import { logEvent } from "@/lib/metrics";
import StorageUsage from "@/components/StorageUsage";

/* ------------------------------------------------------------------ *
 * 내보내기 · 되돌리기.
 *
 * ★ 이 화면은 "있으면 좋은 기능"이 아니다.
 *   출퇴근·근로계약은 근로기준법 제42조로 **3년 보존** 대상인데,
 *   지금 저장소는 이 태블릿 브라우저 하나뿐이다.
 *   태블릿을 잃으면 3년치가 같이 사라진다.
 *
 * 화면 순서를 일부러 이렇게 뒀다.
 *   1) 지금 무엇이 몇 건 있는지 먼저 보여준다 (0건인데 내려받으면 헛일이다)
 *   2) 내보내기
 *   3) 되돌리기 — **덮어쓰기라서 맨 아래에 두고 확인을 두 번 받는다**
 * ------------------------------------------------------------------ */

type Stage =
  | { s: "idle" }
  | {
      s: "checked";
      file: BackupFile;
      counts: ReturnType<typeof backupCounts>;
      /**
       * ★ "덮어쓰면 사라지는 것"의 건수. 파일을 고른 **그 순간**에 다시 읽는다.
       *
       * 화면을 열 때 읽은 값을 쓰면 안 된다 — 사장님이 이 화면을 열어두고
       * 다른 탭에서 출퇴근을 찍고 돌아오면, 경고가 실제보다 적은 숫자를
       * 보여준다. 덮어쓰기 경고에서 숫자가 적게 나오는 쪽으로 틀리면
       * 사람이 가볍게 누른다.
       */
      losing: ReturnType<typeof backupCounts>;
    }
  | { s: "error"; reason: string }
  | { s: "done"; failed: string[] };

/** 브라우저에서 파일로 내려준다 */
function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 바로 지우면 사파리에서 저장이 취소되는 일이 있다
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupView({
  storeName,
  cycleLabels = {},
}: {
  storeName: string;
  /** 점검 항목 id → 이름·묶음. 시드에서 서버가 만들어 넘긴다 */
  cycleLabels?: Record<string, { title: string; group: string }>;
}) {
  // localStorage는 서버 렌더에서 못 본다. 마운트 뒤에 읽는다
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState<BackupFile | null>(null);
  const [stage, setStage] = useState<Stage>({ s: "idle" });
  const [demoBusy, setDemoBusy] = useState(false);

  /** 시연 데이터를 되돌리기와 같은 길로 올린다 — 확인 화면을 건너뛰지 않는다 */
  async function loadDemo() {
    setDemoBusy(true);
    try {
      const res = await fetch("/demo-backup.json", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const r = checkRestore(await res.text());
      setStage(
        r.ok
          ? {
              s: "checked",
              file: r.file,
              counts: r.counts,
              losing: backupCounts(buildBackup(storeName)),
            }
          : { s: "error", reason: r.reason },
      );
    } catch {
      setStage({
        s: "error",
        reason: "시연 데이터를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.",
      });
    } finally {
      setDemoBusy(false);
    }
  }
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setSnap(buildBackup(storeName));
  }

  useEffect(() => {
    setReady(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !snap) {
    return (
      <Screen title="내보내기 · 되돌리기" storeName={storeName}>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  const c = backupCounts(snap);
  const stamp = today();
  /* 한 덩이라도 있으면 백업할 값이 있다. 어느 것이든 잃으면 못 되찾는다 —
     그래서 "비었다" 판정에 여덟 가지를 다 본다. 하나만 보고 판정하면
     거래처 단가만 넣어둔 매장에게 "저장된 것이 없습니다" 라고 말하게 된다. */
  const empty = Object.values(c).every((n) => n === 0);

  return (
    <Screen title="내보내기 · 되돌리기" storeName={storeName}>
      <Card
        className="mt-5"
        title="지금 이 태블릿에 있는 것"
        note="내려받기 전에 몇 건인지 먼저 확인하세요."
      >
        <div className="mt-2">
          <Row label="직원" value={`${c.staff}명`} />
          <Row label="출퇴근 기록" value={`${c.punches}건`} />
          <Row label="근로계약" value={`${c.contracts}건`} />
          <Row label="점검 기록" value={`${c.cycle}건`} />
          {/* ★ 아래 넷은 v3 부터 담긴다. 그전에는 화면에도 없고 백업에도
              없었다 — 사장님은 담긴 줄 알고 있었다 (2026-09-10) */}
          <Row label="매출" value={`${c.salesDays}일치`} />
          <Row label="거래처" value={`${c.vendors}곳`} />
          <Row label="내 레시피" value={`${c.recipes}개`} />
          <Row label="발주 기록" value={`${c.orderDays}일치`} />
        </div>

        {empty && (
          <Caveat>
            아직 저장된 것이 없습니다. 출퇴근·계약서를 먼저 입력한 뒤에
            내보내세요.
          </Caveat>
        )}

        <Caveat>
          <b>출퇴근 기록과 근로계약은 3년간 보관해야 합니다</b>(근로기준법
          제42조). 그런데 이 앱은 지금 <b>이 태블릿 안에만</b> 저장합니다 —
          태블릿을 잃거나 초기화하면 같이 사라집니다.{" "}
          <b>한 달에 한 번은 내려받아 다른 곳에 두세요.</b>
        </Caveat>
      </Card>

      {/* ---------- 내보내기 ---------- */}
      <Card
        className="mt-4"
        title="내보내기"
        note="엑셀로 볼 파일과, 앱으로 되돌릴 파일이 따로입니다."
      >
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            className={BTN}
            disabled={c.punches === 0}
            onClick={() =>
              download(
                `출퇴근_${stamp}.csv`,
                toCsv(punchRows(snap.punches, snap.roster.staff)),
                "text/csv",
              )
            }
          >
            📄 출퇴근 기록 (엑셀 · CSV)
          </button>

          <button
            type="button"
            className={BTN}
            disabled={c.contracts === 0}
            onClick={() =>
              download(
                `근로계약_${stamp}.csv`,
                toCsv(contractRows(snap.contracts, snap.roster.staff)),
                "text/csv",
              )
            }
          >
            📄 근로계약 (엑셀 · CSV)
          </button>

          <button
            type="button"
            className={BTN}
            disabled={c.cycle === 0}
            onClick={() =>
              download(
                `점검기록_${stamp}.csv`,
                toCsv(
                  cycleRows(snap.cycleDone ?? {}, snap.cycleEvery ?? {}, cycleLabels),
                ),
                "text/csv",
              )
            }
          >
            📄 주기 점검 기록 (엑셀 · CSV)
          </button>

          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={empty}
            onClick={() => {
              const file = buildBackup(storeName);
              download(
                `매장수첩_백업_${stamp}.json`,
                JSON.stringify(file, null, 2),
                "application/json",
              );
              /* ★ 여기서만 "백업했다" 를 기록한다. CSV 는 되돌릴 수 없으므로 안 센다.
                 → backup.ts 의 markBackedUp 주석 */
              const marked = markBackedUp();
              /* 재촉이 실제로 먹히는지 보려면 이게 필요하다. 파일 내용은 안 담는다 */
              logEvent("백업_내려받기", { counts: backupCounts(file), marked });
            }}
          >
            💾 전체 백업 (되돌리기용 · JSON)
          </button>
        </div>

        <Caveat>
          내려받은 파일에는 <b>직원 이름·연락처·시급·근무기록</b>이 들어
          있습니다. 카톡·메일로 돌리지 말고, 사장님만 보는 곳에 두세요.
        </Caveat>

        <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2.5 text-[12px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          CSV는 <b>보관·제출용</b>입니다. 되돌리기에는 쓸 수 없습니다 — 엑셀에서
          한 칸만 고쳐도 시각이나 요일이 깨지고, 그러면 근태와 인건비가 틀린
          채로 계산됩니다. 되돌리기는 JSON만 받습니다.
        </p>
      </Card>

      {/* ---------- 되돌리기 ---------- */}
      <Card
        className="mt-4"
        title="되돌리기"
        note="기기를 바꿨거나 저장소가 비었을 때 백업 JSON으로 되살립니다."
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = await f.text();
            const r = checkRestore(text);
            setStage(
              r.ok
                ? {
                    s: "checked",
                    file: r.file,
                    counts: r.counts,
                    // 지금 저장소를 다시 읽는다 (마운트 때 값이 아니라)
                    losing: backupCounts(buildBackup(storeName)),
                  }
                : { s: "error", reason: r.reason },
            );
            // 같은 파일을 다시 고를 수 있게 비운다
            e.target.value = "";
          }}
        />

        {stage.s === "idle" && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN}
                onClick={() => fileRef.current?.click()}
              >
                백업 파일 고르기
              </button>
              <button
                type="button"
                className={BTN}
                disabled={demoBusy}
                onClick={loadDemo}
              >
                {demoBusy ? "불러오는 중…" : "시연 데이터 넣기"}
              </button>
            </div>
            {/* ★ 시연 데이터 — 발표·연습용 가짜 데이터 (2026-09-14).
                직원·출퇴근·시급·매출·거래처 단가·판매가·고정비·점검 기록은
                전부 브라우저에만 살아서 새 기기는 그 화면이 다 비어 있다.
                되돌리기와 **같은 길**(checkRestore → 확인 → applyRestore)로
                넣으므로 아래 확인 화면이 그대로 뜬다 — 실매장 기록이 있는
                태블릿이면 거기서 「그만두기」 를 누르면 된다.
                → db/demo.js · public/demo-backup.json · tests/demoBackup.test.ts */}
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              <b>시연 데이터</b>는 발표·연습용 <b>가짜</b>입니다 — 직원 4명 ·
              지난주 출퇴근 · 근로계약 · 13일치 매출 · 거래처 3곳과 단가 ·
              판매가·고정비 · 점검 기록. 넣기 전에 지금 것이 얼마나 사라지는지
              한 번 더 보여줍니다.
            </p>
          </>
        )}

        {stage.s === "error" && (
          <div className="mt-3">
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {stage.reason}
            </p>
            <button
              type="button"
              className={`${BTN} mt-2`}
              onClick={() => setStage({ s: "idle" })}
            >
              다시 고르기
            </button>
          </div>
        )}

        {stage.s === "checked" && (
          <div className="mt-3">
            <p className="text-[13px] font-semibold">이 백업으로 되돌립니다</p>
            <div className="mt-2">
              <Row label="만든 날" value={stage.file.exportedAt.slice(0, 10)} />
              <Row label="매장" value={stage.file.storeName || "(이름 없음)"} />
              <Row label="직원" value={`${stage.counts.staff}명`} />
              <Row label="출퇴근" value={`${stage.counts.punches}건`} />
              <Row label="근로계약" value={`${stage.counts.contracts}건`} />
              {/* ★ 되돌리기가 덮어쓰는 것은 전부 여기 적는다. 화면에 없는 것을
                  덮어쓰면 사람은 무엇을 잃는지 모르고 누른다 (2026-09-10 점검) */}
              <Row label="점검 기록" value={`${stage.counts.cycle}건`} />
              <Row label="매출" value={`${stage.counts.salesDays}일치`} />
              <Row label="거래처" value={`${stage.counts.vendors}곳`} />
              <Row label="내 레시피" value={`${stage.counts.recipes}개`} />
              <Row label="발주 기록" value={`${stage.counts.orderDays}일치`} />
            </div>

            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <b>지금 이 태블릿에 있는 것은 사라집니다.</b> 합치지 않고
              덮어씁니다 (직원 {stage.losing.staff}명 · 출퇴근{" "}
              {stage.losing.punches}건 · 계약 {stage.losing.contracts}건 · 점검{" "}
              {stage.losing.cycle}건 · 매출 {stage.losing.salesDays}일치 · 거래처{" "}
              {stage.losing.vendors}곳 · 레시피 {stage.losing.recipes}개 · 발주{" "}
              {stage.losing.orderDays}일치). 지금
              것이 더 최신이면 <b>먼저 전체 백업을 내려받으세요.</b>
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={`${BTN_PRIMARY} flex-1`}
                onClick={() => {
                  const r = applyRestore(stage.file);
                  setStage({ s: "done", failed: r.failed });
                  reload();
                }}
              >
                덮어쓰기
              </button>
              <button
                type="button"
                className={BTN}
                onClick={() => setStage({ s: "idle" })}
              >
                그만두기
              </button>
            </div>
          </div>
        )}

        {stage.s === "done" && (
          <div className="mt-3">
            {stage.failed.length === 0 ? (
              <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                되돌렸습니다. 출퇴근·계약서 화면에서 확인해보세요.
              </p>
            ) : (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
                일부를 저장하지 못했습니다: {stage.failed.join(" · ")}. 이
                태블릿의 저장공간이 꽉 찼거나 사생활 보호 모드일 수 있습니다.
              </p>
            )}
            <button
              type="button"
              className={`${BTN} mt-2`}
              onClick={() => setStage({ s: "idle" })}
            >
              확인
            </button>
          </div>
        )}
      </Card>

      <StorageUsage />

      {/* ★ 이 칸은 "무엇이 안 담기는가"를 말한다. 틀리면 사장님이 담긴 줄 알고
          태블릿을 바꾼다. 담는 것을 늘릴 때 여기도 같이 고칠 것.
          (2026-09-10 까지 "매출·거래처는 아직 포함되지 않습니다"라고 적혀
          있었고, 실제로도 안 담기고 있었다. 이제 담는다.) */}
      <p className="mt-4 rounded-xl bg-zinc-100 px-3.5 py-3 text-[12px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        <b>전체 백업(JSON)</b>은 위에 적힌 여덟 가지를 전부 담습니다 — 직원 ·
        출퇴근 · 근로계약 · 점검 기록 · 매출 · 거래처 단가 · 내 레시피 · 발주
        기록. <b>담지 않는 것은 잠금번호뿐입니다</b> (파일이 돌아다니면 그대로
        보이니까요). 오늘 체크한 체크리스트·프렙은 어차피 다음 영업일에
        초기화되므로 담지 않습니다.
      </p>
    </Screen>
  );
}
