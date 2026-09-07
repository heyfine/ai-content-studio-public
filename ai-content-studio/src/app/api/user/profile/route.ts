import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateProfileSchema } from "@/lib/auth-schema";
import { prisma } from "@/lib/prisma";

/** 修改当前登录用户的显示名（用户名） */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body: unknown = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "参数不合法" },
        { status: 400 },
      );
    }
    const name = parsed.data.name === "" ? null : parsed.data.name;
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
      select: { id: true, email: true, name: true },
    });
    return NextResponse.json(user);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "修改用户名失败" }, { status: 500 });
  }
}
