import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite(デモDB) は wasm を含むため、バンドルせず node_modules から読み込ませる。
  // これがないとサーバー側で wasm のパス解決に失敗する。
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
