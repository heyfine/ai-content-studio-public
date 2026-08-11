import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteWordpressConfig, updateWordpressConfig } from "@/lib/services/wordpress-service";
import { wordpressConfigUpdateSchema } from "@/lib/schemas/wordpress";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const parsed = wordpressConfigUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const updated = await updateWordpressConfig(id, parsed.data);
    return NextResponse.json({ id: updated.id });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "更新站点失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    await deleteWordpressConfig(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除站点失败" }, { status: 500 });
  }
}
