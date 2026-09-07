import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { authorizeCredentials } from "@/lib/credentials";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // 覆盖 session 回调：显示名实时取库（JWT 内 name 是登录时刻快照，
    // 改名后不重新登录也应在顶栏生效）。查库失败回退 token 内 name。
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) {
          session.user.id = token.sub;
        }
        session.user.role = typeof token.role === "string" ? token.role : "EDITOR";
        try {
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true },
          });
          if (user) {
            session.user.name = user.name;
          }
        } catch {
          // 库不可用时保持 token 内快照名
        }
      }
      return session;
    },
  },
});
