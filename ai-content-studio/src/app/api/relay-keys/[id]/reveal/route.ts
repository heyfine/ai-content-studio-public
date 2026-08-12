import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revealRelayKey } from "@/lib/services/relay-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    const secret = await revealRelayKey(id);
    return NextResponse.json({ id, key: secret });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "查看密钥失败" }, { status: 500 });
  }
}
