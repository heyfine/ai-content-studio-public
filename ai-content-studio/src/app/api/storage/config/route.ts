import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listStorageConfigs, saveStorageConfig } from "@/lib/services/storage-service";

const configSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "请填写配置名称"),
  providerId: z.string().default("custom"),
  endpoint: z
    .string()
    .min(1, "请填写 S3 端点（如 https://s3.cstcloud.cn）")
    .url("端点需为合法 URL，须含协议头（如 https://s3.cstcloud.cn）"),
  region: z.string().default("us-east-1"),
  bucket: z.string().min(1, "请填写桶名"),
  accessKeyId: z.string().min(1, "请填写 AccessKeyId"),
  /** 留空表示沿用已存的 SecretKey（编辑场景） */
  secretKey: z.string().optional(),
  /** 桶公网直出域名；数据胶囊等无私有域厂商留空（走预签名 URL） */
  publicBase: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || /^https?:\/\//.test(v), "公网访问基址须以 http(s):// 开头"),
  keyPrefix: z.string().default("acs/"),
  /** 数据胶囊等 UA 绑定应用的 id（s3drive/rclone/...） */
  clientApp: z.string().default(""),
  enabled: z.boolean().default(false),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.json(await listStorageConfigs());
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取存储配置失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body: unknown = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "参数不合法" },
        { status: 400 },
      );
    }
    const { id, ...rest } = parsed.data;
    if (id) {
      const exists = await prisma.storageConfig.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        return NextResponse.json({ error: "配置不存在" }, { status: 404 });
      }
    }
    const saved = await saveStorageConfig(id ?? null, rest);
    return NextResponse.json(saved, { status: id ? 200 : 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "保存存储配置失败" }, { status: 500 });
  }
}
