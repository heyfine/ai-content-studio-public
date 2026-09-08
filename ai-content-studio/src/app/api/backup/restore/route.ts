import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restoreBackup } from "@/lib/services/backup-service";

const restoreSchema = z.object({
  backup: z.unknown(),
  mode: z.enum(["merge", "overwrite"]).default("merge"),
  /** 旧版本备份（文件内无来源密钥）跨环境还原时手动提供，用于解密并重加密密文字段 */
  sourceEncryptionKey: z.string().optional(),
});

/** POST /api/backup/restore — 还原备份（校验 + merge/overwrite 写入 + 密文跨环境重加密） */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body: unknown = await request.json();
    const parsed = restoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "请上传有效的备份文件" },
        { status: 400 },
      );
    }
    const result = await restoreBackup(prisma, parsed.data.backup, parsed.data.mode, {
      sourceEncryptionKey: parsed.data.sourceEncryptionKey,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ cause: message, error: message }, { status: 400 });
  }
}
