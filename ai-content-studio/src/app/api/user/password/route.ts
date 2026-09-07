import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updatePasswordSchema } from "@/lib/auth-schema";
import { prisma } from "@/lib/prisma";

/** 修改当前登录用户密码：验证当前密码 → bcrypt 哈希新密码入库 */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body: unknown = await request.json();
    const parsed = updatePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "参数不合法" },
        { status: 400 },
      );
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    const currentOk = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!currentOk) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "修改密码失败" }, { status: 500 });
  }
}
