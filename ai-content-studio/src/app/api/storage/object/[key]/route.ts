import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEnabledStorageConfig } from "@/lib/services/storage-service";

/**
 * 对象存储取图代理：无私有公网域名的厂商（数据胶囊）网关连预签名 URL 都按 User-Agent 拦，
 * 匿名浏览器无法直接取图 → 由本路由携带绑定 UA 从桶里取流转发。
 * URL 形如 /api/storage/object/acs%2Fxxx.png，仅允许配置 keyPrefix 下对象。
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const storage = await getEnabledStorageConfig();
    if (!storage) {
      return NextResponse.json({ error: "未启用对象存储" }, { status: 400 });
    }
    const { key } = await ctx.params;
    const decoded = decodeURIComponent(key);
    if (!decoded.startsWith(storage.keyPrefix) || decoded.includes("..")) {
      return NextResponse.json({ error: "仅允许访问本应用前缀下的对象" }, { status: 403 });
    }
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { decrypt } = await import("@/lib/crypto");
    const { S3_CLIENT_APP_OPTIONS, getPreset } = await import("@/lib/services/storage-service");
    const preset = getPreset(storage.providerId);
    const ua = S3_CLIENT_APP_OPTIONS.find((o) => o.id === storage.clientApp)?.userAgent;
    const client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region || preset.region || "us-east-1",
      forcePathStyle: preset.pathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: decrypt(storage.secretKey),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    let upstream: Response;
    try {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: storage.bucket, Key: decoded }),
        {
          expiresIn: 60,
        },
      );
      // 预签名 URL 不携带 UA；数据胶囊网关对取图请求同样校验 User-Agent → 手动补上
      upstream = await fetch(url, { headers: ua ? { "User-Agent": ua } : {} });
    } finally {
      client.destroy();
    }
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `对象读取失败（HTTP ${upstream.status}）` },
        { status: 502 },
      );
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": upstream.headers.get("content-length")! }
          : {}),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "对象代理读取失败" }, { status: 500 });
  }
}
