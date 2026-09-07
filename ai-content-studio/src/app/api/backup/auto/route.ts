import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getAutoBackupSettings,
  getAutoBackupStatus,
  listBackupFiles,
  restoreFromWebdav,
  runAutoBackup,
  saveAutoBackupSettings,
  testWebdavTarget,
} from "@/lib/services/auto-backup-service";

function unauthorized() {
  return NextResponse.json({ error: "未授权" }, { status: 401 });
}

function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ cause: message, error: message }, { status: 400 });
}

/** GET /api/backup/auto — 设置 + 状态（密码不回显） */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    return NextResponse.json({
      settings: await getAutoBackupSettings(prisma),
      status: await getAutoBackupStatus(prisma),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PUT /api/backup/auto — 保存自动备份设置（targets 多目标；密码选填，传了才更新） */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    const body = (await request.json().catch(() => null)) as {
      enabled?: boolean;
      targets?: Array<Record<string, unknown>>;
    } | null;
    if (!body) {
      return NextResponse.json({ error: "设置内容无效" }, { status: 400 });
    }
    const settings = await saveAutoBackupSettings(prisma, {
      enabled: body.enabled === true,
      targets: (Array.isArray(body.targets) ? body.targets : []) as never,
    });
    return NextResponse.json(settings);
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/backup/auto — 子操作分发：run / test / files / restore */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as {
      op?: string;
      targetId?: string;
      filename?: string;
      mode?: string;
    };
    if (body.op === "run") {
      return NextResponse.json(await runAutoBackup({ force: true }));
    }
    if (body.op === "test") {
      return NextResponse.json(await testWebdavTarget(body.targetId ?? ""));
    }
    if (body.op === "files") {
      return NextResponse.json({ files: await listBackupFiles(body.targetId ?? "") });
    }
    if (body.op === "restore") {
      const mode = body.mode === "overwrite" ? "overwrite" : "merge";
      return NextResponse.json(
        await restoreFromWebdav(body.targetId ?? "", body.filename ?? "", mode),
      );
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
