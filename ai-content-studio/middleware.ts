import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// edge-safe：不引入 prisma/bcryptjs，仅做 JWT 鉴权；node-only authorize 在 lib/auth.ts。
export const { auth: middleware } = NextAuth({
  ...authConfig,
  providers: [],
});

export const config = {
  matcher: ["/((?!api|v1|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
