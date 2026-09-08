import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revealStorageSecret } from "@/lib/services/storage-service";

/** 查看 S3 SecretAccessKey 明文（登录态保护，AES-256-GCM 解密后返回） */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    const secret = await revealStorageSecret(id);
    return NextResponse.json({ id, secret });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "查看密钥失败" }, { status: 500 });
  }
}
