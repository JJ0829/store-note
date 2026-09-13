import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 체크리스트 사진은 Supabase Storage 등 외부 호스트로 옮길 수 있으므로
  // 여기에 도메인을 추가한다.
  images: { remotePatterns: [] },

  // ★ Replit 에서 개발할 때만 쓰인다 (dev 전용 설정이라 배포 빌드에는 영향 없다).
  //   Replit 은 앱을 컨테이너 안 3000 번에 띄우고 브라우저는 *.replit.dev 로
  //   들어온다. 출처가 다르므로 Next 15.3+ 는 dev 전용 요청(HMR·소스맵)을
  //   막고, 화면은 뜨는데 고쳐도 안 바뀌는 상태가 된다. 원인을 알기 어렵다.
  allowedDevOrigins: ["*.replit.dev", "*.repl.co", "*.replit.app"],
};

export default nextConfig;
