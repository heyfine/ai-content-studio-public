import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setRelayKeyEnabled, deleteRelayKey } from "@/lib/services/relay-service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as { enabled?: boolean };
    const enabled = body.enabled;
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled 必传布尔" }, { status: 400 });
    }
    const row = await setRelayKeyEnabled(id, enabled);
    return NextResponse.json({ id: row.id, enabled: row.enabled });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "切换状态失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    await deleteRelayKey(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除失败" }, { status: 500 });
  }
}
