import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 依赖运行时通过 node_modules/.prisma/client 解析 generated client，
  // 必须排除出 Turbopack 的 server bundle，否则报 "did not initialize yet"。
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
