import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 起 middleware 约定废弃，改名 proxy（文件名与导出函数名都要改）：
// 见 node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{middleware,proxy}.md。
// 注意：导出必须是具名 function proxy / default function，`export const { auth: proxy } = ...`
// 这种解构形式无法被 Next 静态分析识别（实测报 "Proxy is missing expected function export name"）。
// edge-safe：不引入 prisma/bcryptjs，仅做 JWT 鉴权；node-only authorize 在 lib/auth.ts。
const { auth } = NextAuth({
  ...authConfig,
  providers: [],
});

export function proxy(request: Parameters<typeof auth>[0]) {
  return auth(request);
}

export const config = {
  matcher: ["/((?!api|v1|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
