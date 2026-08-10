import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updatePrompt, deletePrompt } from "@/lib/services/prompt-service";
import { updatePromptSchema } from "@/lib/schemas/prompt";

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = updatePromptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await updatePrompt(id, parsed.data));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("不存在")) {
      return NextResponse.json({ error: "Prompt 不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "更新 Prompt 失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await deletePrompt(id));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除 Prompt 失败" }, { status: 500 });
  }
}
