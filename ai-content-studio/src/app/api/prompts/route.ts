import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listPrompts, createPrompt } from "@/lib/services/prompt-service";
import { createPromptSchema } from "@/lib/schemas/prompt";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? undefined;
    return NextResponse.json(await listPrompts(type));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取 Prompt 失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createPromptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json(await createPrompt(parsed.data), { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "创建 Prompt 失败" }, { status: 500 });
  }
}
