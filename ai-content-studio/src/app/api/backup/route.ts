import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BACKUP_DOMAINS, createBackup } from "@/lib/services/backup-service";

const createSchema = z.object({
  full: z.boolean().optional(),
  domains: z.array(z.string()).optional(),
});

function unauthorized() {
  return NextResponse.json({ error: "未授权" }, { status: 401 });
}

/** GET /api/backup/domains — 可备份域列表（前端渲染勾选） */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    return NextResponse.json({ domains: BACKUP_DOMAINS });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取备份域失败" }, { status: 500 });
  }
}

/** POST /api/backup — 按所选域（或整站）导出数据 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "参数不合法" },
        { status: 400 },
      );
    }
    const result = await createBackup(prisma, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ cause: message, error: message }, { status: 400 });
  }
}
