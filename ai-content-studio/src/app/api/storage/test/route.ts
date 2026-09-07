import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { describeStorageError, testStorageConnection } from "@/lib/services/storage-service";

const testSchema = z.object({
  id: z.string().uuid().optional(),
  providerId: z.string().optional(),
  endpoint: z.string().min(1, "请填写 S3 端点"),
  region: z.string().default("us-east-1"),
  bucket: z.string().min(1, "请填写桶名"),
  accessKeyId: z.string().min(1, "请填写 AccessKeyId"),
  /** 留空且带 id 时沿用已存 SecretKey */
  secretKey: z.string().optional(),
  /** 数据胶囊等 UA 绑定应用 */
  clientApp: z.string().optional(),
});

/** 连通性测试：HeadBucket 校验凭证、UA 绑定与桶 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body: unknown = await request.json();
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "参数不合法" },
        { status: 400 },
      );
    }
    const result = await testStorageConnection(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { cause: describeStorageError(e), error: "连接失败" },
      { status: 502 },
    );
  }
}
