import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/auth-schema";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
): Promise<AuthUser | null> {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
