import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 체크리스트 사진은 Supabase Storage 등 외부 호스트로 옮길 수 있으므로
  // 여기에 도메인을 추가한다.
  images: { remotePatterns: [] },
};

export default nextConfig;
