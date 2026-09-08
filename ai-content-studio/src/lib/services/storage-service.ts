/**
 * S3 兼容对象存储服务：配置管理 + S3 操作 + 预签名访问。
 * 兼容任意 S3 API 厂商（数据胶囊/缤纷云/阿里 OSS/腾讯 COS/R2/MinIO/自定义）。
 *
 * 厂商预设目录拆在 storage-providers.ts（纯数据，客户端组件可直接导入）。
 *
 * 关键兼容点（设置方法照搬 shrimpsend 项目对中国科技云数据胶囊的处理）：
 * - 数据胶囊（cstcloud.cn）网关按 User-Agent 校验：只放行与 AccessKey 绑定应用一致的 UA
 *   （S3Drive/rclone/S3 Browser/Obsidian/Cherry Studio），SDK 默认 UA 一律 401 → 需伪装 UA
 * - 数据胶囊 region 固定 us-east-1；SDK v3 默认给新对象加 x-amz-checksum 头，部分 S3 网关不识别 → 显式 WHEN_REQUIRED 关闭
 * - 路径风格按厂商预设：数据胶囊/自定义/R2 = Path-Style；缤纷云/COS/OSS = 虚拟桶式
 * - 无公网直出域名的厂商（数据胶囊）走本应用代理路由（预签名会被 UA 拦匿名请求）
 */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { getPreset, inferProviderIdFromEndpoint, resolveUserAgent } from "./storage-providers";

export type { S3ClientAppId, S3ProviderPreset } from "./storage-providers";
// 厂商预设目录已拆至 storage-providers.ts，此处 re-export 保持既有导入路径不变
export {
  getPreset,
  inferProviderIdFromEndpoint,
  resolveUserAgent,
  S3_CLIENT_APP_OPTIONS,
  S3_PROVIDER_PRESETS,
} from "./storage-providers";

export interface StorageConfigSafe {
  id: string;
  name: string;
  providerId: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  publicBase: string;
  keyPrefix: string;
  clientApp: string;
  enabled: boolean;
}

export interface StorageConfigRow {
  id: string;
  name: string;
  providerId: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretKey: string;
  publicBase: string;
  keyPrefix: string;
  clientApp: string;
  enabled: boolean;
}

function toSafe(row: StorageConfigRow): StorageConfigSafe {
  return {
    id: row.id,
    name: row.name,
    providerId: row.providerId,
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.accessKeyId,
    publicBase: row.publicBase,
    keyPrefix: row.keyPrefix,
    clientApp: row.clientApp,
    enabled: row.enabled,
  };
}

export async function listStorageConfigs(): Promise<StorageConfigSafe[]> {
  const rows = await prisma.storageConfig.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toSafe);
}

export async function getEnabledStorageConfig(): Promise<StorageConfigRow | null> {
  const row = await prisma.storageConfig.findFirst({ where: { enabled: true } });
  return row ?? null;
}

export interface StorageConfigInput {
  name: string;
  providerId: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  /** 传空表示沿用原 secretKey（编辑场景） */
  secretKey?: string;
  publicBase: string;
  keyPrefix: string;
  clientApp?: string;
  enabled: boolean;
}

/** 创建或更新配置（upsert 语义由调用方带 id 决定）；单条启用约束在此收敛 */
export async function saveStorageConfig(
  id: string | null,
  input: StorageConfigInput,
): Promise<StorageConfigSafe> {
  if (input.enabled) {
    // 单条生效：先全部下线，再启用目标
    await prisma.storageConfig.updateMany({ where: { enabled: true }, data: { enabled: false } });
  }
  const data = {
    name: input.name,
    providerId: getPreset(input.providerId).id,
    endpoint: input.endpoint.replace(/\/+$/, ""),
    region: input.region || "us-east-1",
    bucket: input.bucket,
    accessKeyId: input.accessKeyId,
    secretKey: input.secretKey ? encrypt(input.secretKey) : undefined,
    publicBase: input.publicBase.replace(/\/+$/, ""),
    keyPrefix: input.keyPrefix,
    clientApp: input.clientApp ?? "",
    enabled: input.enabled,
  };
  const row = id
    ? await prisma.storageConfig.update({ where: { id }, data })
    : await prisma.storageConfig.create({
        data: { ...data, secretKey: data.secretKey ?? encrypt("") },
      });
  return toSafe(row);
}

export async function deleteStorageConfig(id: string): Promise<void> {
  await prisma.storageConfig.delete({ where: { id } });
}

function buildClient(row: StorageConfigRow): S3Client {
  const preset = getPreset(row.providerId);
  const userAgent = resolveUserAgent(row.clientApp);
  return new S3Client({
    endpoint: row.endpoint,
    region: row.region || preset.region || "us-east-1",
    forcePathStyle: preset.pathStyle,
    credentials: {
      accessKeyId: row.accessKeyId,
      secretAccessKey: decrypt(row.secretKey),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(userAgent ? { customUserAgent: userAgent } : {}),
  });
}

/** 对象访问 URL：有公网基址直出；无私有域（数据胶囊）走本应用代理路由 */
async function objectAccessUrl(row: StorageConfigRow, key: string): Promise<string> {
  const base = row.publicBase.replace(/\/+$/, "");
  if (base) return `${base}/${key}`;
  return `/api/storage/object/${encodeURIComponent(key)}`;
}

/** 上传对象：返回访问 URL（公网直出或预签名） */
export async function putObject(
  row: StorageConfigRow,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const client = buildClient(row);
  try {
    await client.send(
      new PutObjectCommand({ Bucket: row.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
  } finally {
    client.destroy();
  }
  return objectAccessUrl(row, key);
}

export async function deleteRemoteObject(row: StorageConfigRow, key: string): Promise<void> {
  const client = buildClient(row);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: row.bucket, Key: key }));
  } finally {
    client.destroy();
  }
}

export interface StorageObjectData {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/**
 * 服务端直读对象字节（带 keyPrefix 与目录穿越校验，与代理路由同规则）。
 * 供服务端取图场景使用（如微信发布）：/api/storage/object/ 代理路由需要登录态，
 * 服务端 fetch 自调用拿不到 cookie 会 401，因此必须走 SDK 直读而非 HTTP。
 */
export async function readStorageObject(key: string): Promise<StorageObjectData> {
  const row = await getEnabledStorageConfig();
  if (!row) throw new Error("未启用对象存储，无法读取站内对象图片");
  if (!key.startsWith(row.keyPrefix) || key.includes("..")) {
    throw new Error(`对象不在本应用存储前缀内，已拒绝读取：${key}`);
  }
  const client = buildClient(row);
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: row.bucket, Key: key }));
    if (!res.Body) throw new Error("对象内容为空");
    const bytes = new Uint8Array(await res.Body.transformToByteArray());
    return { bytes, contentType: res.ContentType ?? "application/octet-stream" };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("对象")) throw e;
    throw new Error(`站内对象图片读取失败（${key}）：${describeStorageError(e)}`);
  } finally {
    client.destroy();
  }
}

export interface RemoteImageEntry {
  key: string;
  url: string;
  size: number;
  /** LastModified ISO 串 */
  mtime: string;
}

/** 列举桶内指定前缀下的图片对象（按时间倒序）；url 同样区分直出/代理 */
export async function listObjectsUnderPrefix(
  row: StorageConfigRow,
  prefix: string,
): Promise<RemoteImageEntry[]> {
  const client = buildClient(row);
  const keys: Array<{ key: string; size: number; mtime: string }> = [];
  try {
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: row.bucket,
          Prefix: prefix,
          MaxKeys: 500,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        keys.push({
          key: obj.Key,
          size: obj.Size ?? 0,
          mtime: (obj.LastModified ?? new Date(0)).toISOString(),
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  } finally {
    client.destroy();
  }
  // 逐个签访问 URL（个人图床列表规模有限，可接受）
  const out: RemoteImageEntry[] = [];
  for (const item of keys.sort((a, b) => (a.mtime < b.mtime ? 1 : -1))) {
    out.push({ ...item, url: await objectAccessUrl(row, item.key) });
  }
  return out;
}

/** 列举桶内 keyPrefix 下的图片对象（按时间倒序）；url 同样区分直出/代理 */
export async function listRemoteImages(row: StorageConfigRow): Promise<RemoteImageEntry[]> {
  return listObjectsUnderPrefix(row, row.keyPrefix);
}

/** 桶内复制对象（回收站移动用：Copy 到目标 key 后删除源对象） */
export async function copyRemoteObject(
  row: StorageConfigRow,
  fromKey: string,
  toKey: string,
): Promise<void> {
  const client = buildClient(row);
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: row.bucket,
        CopySource: `${row.bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
        Key: toKey,
      }),
    );
  } finally {
    client.destroy();
  }
}

export interface StorageTestInput {
  id?: string;
  providerId?: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  /** 留空且带 id 时沿用已存 SecretKey */
  secretKey?: string;
  clientApp?: string;
}

/** 连通性测试：HeadBucket 校验凭证、UA 绑定与桶存在性 */
export async function testStorageConnection(
  input: StorageTestInput,
): Promise<{ ok: true; bucket: string }> {
  let secret = input.secretKey ?? "";
  if (!secret && input.id) {
    const row = await prisma.storageConfig.findUnique({ where: { id: input.id } });
    if (row) secret = decrypt(row.secretKey);
  }
  const preset = getPreset(input.providerId ?? inferProviderIdFromEndpoint(input.endpoint));
  const userAgent = resolveUserAgent(input.clientApp);
  const client = new S3Client({
    endpoint: input.endpoint.replace(/\/+$/, ""),
    region: input.region || preset.region || "us-east-1",
    forcePathStyle: preset.pathStyle,
    credentials: { accessKeyId: input.accessKeyId, secretAccessKey: secret },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(userAgent ? { customUserAgent: userAgent } : {}),
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: input.bucket }));
    return { ok: true, bucket: input.bucket };
  } finally {
    client.destroy();
  }
}

/** 把 SDK 异常翻译成可操作的中文提示 */
export function describeStorageError(err: unknown): string {
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  if (status === 401 || status === 403) {
    return (
      "服务端拒绝了签名（HTTP 401/403）。若为中国科技云数据胶囊：① 「客户端应用」须与你创建 AccessKey 时绑定的应用一致（如 S3Drive）；" +
      "② 重新完整复制 SecretAccessKey（注意首尾空格）；③ Region 保持 us-east-1"
    );
  }
  if (status === 404) return "桶不存在：核对桶名与端点";
  if (status === 301) return "桶区域不匹配：调整 Region";
  const message = err instanceof Error ? err.message : String(err);
  if (/ENOTFOUND|fetch failed|ECONNREFUSED/i.test(message)) {
    return "端点不可达：检查 endpoint 是否正确、服务器能否出网";
  }
  return message || `服务端错误（HTTP ${status ?? "?"}）`;
}
