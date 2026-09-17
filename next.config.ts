import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 체크리스트 사진은 Supabase Storage 등 외부 호스트로 옮길 수 있으므로
  // 여기에 도메인을 추가한다.
  images: { remotePatterns: [] },

  // ★ Replit 에서 개발할 때만 쓰인다 (dev 전용 설정이라 배포 빌드에는 영향 없다).
  //   Replit 은 앱을 컨테이너 안 3000 번에 띄우고 브라우저는 *.replit.dev 로
  //   들어온다. 출처가 다르므로 Next 15.3+ 는 dev 전용 요청(HMR·소스맵)을
  //   막고, 화면은 뜨는데 고쳐도 안 바뀌는 상태가 된다. 원인을 알기 어렵다.
  //   ★ `**` 다. Replit 미리보기 주소는 `<id>.sisko.replit.dev` 처럼 **두 단계**라
  //   `*.replit.dev` 로는 안 잡힌다 (실측 2026-09-14 · `**` 는 깊이 무관).
  allowedDevOrigins: ["**.replit.dev", "**.repl.co", "**.replit.app"],

  /* ★ 2026-09-17 — 보안 헤더 (`06_보안설계.md` V-10).
   *
   *   V-10 은 「배포 전」 항목이었는데 **배포가 먼저 일어났다**(9/14).
   *   그래서 지금 붙인다.
   *
   *   ⚠️ **CSP 는 일부러 안 넣었다.** Next 의 인라인 스크립트·스타일 때문에
   *     `nonce` 없이 넣으면 화면이 통째로 안 뜨고, 그걸 데모데이 전날에
   *     확인하는 건 위험이 이득보다 크다. 아래 넷은 **동작을 바꾸지 않는다.**
   *
   *   ⚠️ HSTS 도 뺐다. 한 번 보내면 브라우저가 오래 기억해서 되돌리기 어렵다.
   *     Vercel 이 이미 HTTPS 전용이라 급하지 않다.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 브라우저가 Content-Type 을 무시하고 스스로 추측하지 못하게 한다
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 남의 사이트가 이 앱을 iframe 에 넣고 클릭을 가로채지 못하게
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // 다른 사이트로 나갈 때 전체 주소를 넘기지 않는다.
          // 체크리스트 주소에 매장 슬러그가 들어 있다
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 위치·마이크는 이 앱이 안 쓴다. 카메라는 촬영 화면이 쓰므로 자기 출처만 허용
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
