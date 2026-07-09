import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com",
        pathname: "/images/P/**",
      },
    ],
  },
  // PGlite(デモDB) は wasm を含むため、バンドルせず node_modules から読み込ませる。
  // これがないとサーバー側で wasm のパス解決に失敗する。
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
