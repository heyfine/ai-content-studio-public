import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @prisma/client 包入口在 pnpm 拓扑下是 stub；real client 在 node_modules/.prisma/client
  // 两者都需排除出 Turbopack server bundle，交由 Node 原生 require 解析（prisma.ts 用 createRequire 解析）
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // Docker 自托管：产出 .next/standalone（含裁剪后的 server.js + node_modules），配合多阶段镜像
  output: "standalone",
};

export default nextConfig;
