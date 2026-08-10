import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testConnection } from "@/lib/services/provider-service";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const id = body?.id;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    return NextResponse.json(await testConnection(id));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "测试连接失败" }, { status: 500 });
  }
}
