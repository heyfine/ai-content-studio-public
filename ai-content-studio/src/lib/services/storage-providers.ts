/**
 * S3 兼容厂商预设目录：端点 / Region / 路径风格 / 客户端应用要求。
 * 从 storage-service 拆出（纯数据、零服务端依赖，客户端组件可直接导入），
 * 兼容方法照搬 shrimpsend 项目对中国科技云数据胶囊的处理。
 */

export interface S3ProviderPreset {
  id: string;
  labelZh: string;
  /** 预填端点（空表示用户自填） */
  endpoint: string;
  region: string;
  pathStyle: boolean;
  /** 客户端应用字段：required（数据胶囊）/ hidden（其他） */
  clientApp: "hidden" | "required";
}

export const S3_PROVIDER_PRESETS: S3ProviderPreset[] = [
  {
    id: "custom",
    labelZh: "自定义 / 其他 S3 兼容",
    endpoint: "",
    region: "us-east-1",
    pathStyle: true,
    clientApp: "hidden",
  },
  {
    id: "data_capsule",
    labelZh: "中国科技云数据胶囊",
    endpoint: "https://s3.cstcloud.cn",
    region: "us-east-1",
    pathStyle: true,
    clientApp: "required",
  },
  {
    id: "bitiful",
    labelZh: "缤纷云",
    endpoint: "https://s3.bitiful.net",
    region: "cn-east-1",
    pathStyle: false,
    clientApp: "hidden",
  },
  {
    id: "aliyun_oss",
    labelZh: "阿里云 OSS",
    endpoint: "",
    region: "us-east-1",
    pathStyle: false,
    clientApp: "hidden",
  },
  {
    id: "tencent_cos",
    labelZh: "腾讯云 COS",
    endpoint: "",
    region: "us-east-1",
    pathStyle: false,
    clientApp: "hidden",
  },
  {
    id: "cloudflare_r2",
    labelZh: "Cloudflare R2",
    endpoint: "",
    region: "auto",
    pathStyle: true,
    clientApp: "hidden",
  },
];

export function getPreset(providerId: string): S3ProviderPreset {
  return S3_PROVIDER_PRESETS.find((p) => p.id === providerId) ?? S3_PROVIDER_PRESETS[0]!;
}

/** 端点推断厂商（存量配置/自定义端点落到预设） */
export function inferProviderIdFromEndpoint(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (host.endsWith("cstcloud.cn")) return "data_capsule";
    if (host.includes("bitiful.net")) return "bitiful";
    if (host.includes("myqcloud.com") || host.includes(".cos.")) return "tencent_cos";
    if (host.includes("r2.cloudflarestorage.com")) return "cloudflare_r2";
    if (host.includes("aliyuncs.com")) return "aliyun_oss";
    return "custom";
  } catch {
    return "custom";
  }
}

/** 数据胶囊 S3 AccessKey 绑定的客户端应用 → 伪装 User-Agent */
export const S3_CLIENT_APP_OPTIONS = [
  { id: "s3drive", label: "S3Drive", userAgent: "S3Drive" },
  { id: "s3browser", label: "S3 Browser", userAgent: "S3 Browser" },
  { id: "rclone", label: "Rclone", userAgent: "rclone/v1.67.0" },
  { id: "obsidian", label: "Obsidian", userAgent: "obsidian" },
  { id: "cherry_studio", label: "Cherry Studio", userAgent: "Cherry Studio" },
] as const;

export type S3ClientAppId = (typeof S3_CLIENT_APP_OPTIONS)[number]["id"];

export function resolveUserAgent(clientApp: string | null | undefined): string | undefined {
  if (!clientApp) return undefined;
  const normalized = clientApp.trim().toLowerCase();
  return S3_CLIENT_APP_OPTIONS.find((o) => o.id === normalized)?.userAgent;
}
