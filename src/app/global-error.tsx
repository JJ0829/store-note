"use client";

/* ------------------------------------------------------------------ *
 * 뼈대(layout) 자체가 터졌을 때의 마지막 그물.
 *
 * `error.tsx` 는 **화면 하나**가 터졌을 때 뜬다. 그런데 layout 이 터지면
 * 그마저도 못 뜬다 — 그때 이 파일이 대신 나온다.
 *
 * ★ 그래서 여기는 **`<html>` 과 `<body>` 를 직접 만든다.** layout 이
 *   안 도는 상황이기 때문이다. 같은 이유로 **공통 컴포넌트를 쓰지 않는다** —
 *   그중 하나가 터진 것일 수도 있다. Tailwind 클래스 대신 인라인 스타일을
 *   쓰는 것도 같은 이유다(스타일이 안 실렸을 수도 있다).
 *
 * 여기까지 오면 화면은 못 살린다. **무엇을 하면 되는지만** 남긴다.
 * ------------------------------------------------------------------ */

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: 24,
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
          앱을 여는 중에 문제가 생겼습니다
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, maxWidth: 380 }}>
          입력하신 기록은 <b>이 기기에 그대로 있습니다.</b>
          <br />
          아래를 눌러도 안 되면 브라우저를 껐다 켜주세요.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            width: "100%",
            maxWidth: 380,
            padding: "16px 20px",
            fontSize: 16,
            fontWeight: 700,
            color: "#fff",
            background: "#f97316",
            border: "none",
            borderRadius: 16,
          }}
        >
          다시 열기
        </button>
        <a
          href="/"
          style={{
            width: "100%",
            maxWidth: 380,
            padding: "15px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "#3f3f46",
            border: "2px solid #d4d4d8",
            borderRadius: 16,
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          처음으로
        </a>
      </body>
    </html>
  );
}
