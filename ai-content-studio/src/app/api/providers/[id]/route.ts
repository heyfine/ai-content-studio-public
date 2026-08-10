import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateProvider, deleteProvider } from "@/lib/services/provider-service";
import { updateProviderSchema } from "@/lib/schemas/provider";

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const valid = updateProviderSchema.safeParse(body);
    if (!valid.success) {
      return NextResponse.json({ error: "校验失败", issues: valid.error.issues }, { status: 400 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await updateProvider(id, valid.data));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "更新供应商失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await deleteProvider(id));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除供应商失败" }, { status: 500 });
  }
}
