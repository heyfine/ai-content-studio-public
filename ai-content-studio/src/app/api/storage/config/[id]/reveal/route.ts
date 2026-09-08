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
    const message = e instanceof Error ? e.message : String(e);
    // 密钥不符/密文损坏 → 明确提示重填；其余透传原始信息
    const friendly = /Unsupported state|unable to authenticate|bad decrypt/i.test(message)
      ? "该密文无法用当前 ENCRYPTION_KEY 解密（备份还原后常见），请重新填写 SecretAccessKey"
      : message.includes("存储配置不存在")
        ? "存储配置不存在，请刷新页面后重试"
        : message;
    return NextResponse.json({ cause: String(e), error: friendly }, { status: 500 });
  }
}
