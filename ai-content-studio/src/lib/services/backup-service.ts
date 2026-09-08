/**
 * 数据备份 / 还原服务（参照 sales record 的域勾选设计，适配 Prisma + PostgreSQL）。
 * - 备份 = 按所选域全量导出各表（Prisma 记录，DateTime 自动序列化为 ISO 字符串）
 * - 还原 = 校验备份文件（magic/版本/表名白名单）后按 RESTORE_ORDER 写入：
 *   merge（默认）= 按主键合并覆盖（upsert），同名覆盖、其余保留、可重复还原；
 *   overwrite = 覆盖还原（事务内清空备份涉及的表再写入，结果 = 备份快照）。
 * - 表名单一律来自后端白名单注册表，不做任何前端拼接。
 * - 注意：备份含密钥类字段（AES-256-GCM 密文/密码哈希），还原库必须与备份库共用同一 ENCRYPTION_KEY。
 */
import { decrypt } from "@/lib/crypto";
import type { PrismaClient } from ".prisma/client";

/** 模型名 → Prisma delegate 属性名（AI 前缀为 aIXxx、WordPress/WeChat 首词小写） */
const DELEGATES = {
  User: "user",
  AIProvider: "aIProvider",
  AIModel: "aIModel",
  AITaskRoute: "aITaskRoute",
  AIGeneration: "aIGeneration",
  Prompt: "prompt",
  Article: "article",
  ArticleVersion: "articleVersion",
  ArticlePublish: "articlePublish",
  SeoReport: "seoReport",
  WordPressConfig: "wordPressConfig",
  WeChatConfig: "weChatConfig",
  WeChatPublish: "weChatPublish",
  RelayApiKey: "relayApiKey",
  WorkflowRun: "workflowRun",
  Source: "source",
  SourceVersion: "sourceVersion",
  StorageConfig: "storageConfig",
  SystemSetting: "systemSetting",
} as const;

export type BackupModel = keyof typeof DELEGATES;

interface DomainMeta {
  key: string;
  label: string;
  description: string;
  models: BackupModel[];
}

/** 备份域：按业务分组勾选；整站备份 = 全部域。
 * system（SystemSetting KV：WebDAV 备份目标等）默认不进任何业务域，
 * 仅整站备份自动附带——WebDAV 目标含密文密码，勾选导出需用户知情。 */
export const BACKUP_DOMAINS: DomainMeta[] = [
  {
    key: "articles",
    label: "文章",
    description: "文章 + 历史版本 + 发布记录 + SEO 报告",
    models: ["Article", "ArticleVersion", "ArticlePublish", "SeoReport"],
  },
  {
    key: "prompts",
    label: "Prompt 模板",
    description: "提示词模板库",
    models: ["Prompt"],
  },
  {
    key: "ai",
    label: "AI 供应商与路由",
    description: "供应商/模型/任务路由/生成记录（API Key 为密文）",
    models: ["AIProvider", "AIModel", "AITaskRoute", "AIGeneration"],
  },
  {
    key: "publishing",
    label: "发布配置",
    description: "WordPress 站点 + 公众号账号 + 公众号草稿记录",
    models: ["WordPressConfig", "WeChatConfig", "WeChatPublish"],
  },
  {
    key: "relay",
    label: "API 中转",
    description: "中转密钥（密文）",
    models: ["RelayApiKey"],
  },
  {
    key: "storage",
    label: "对象存储",
    description: "S3 兼容存储配置（SecretKey 为密文）",
    models: ["StorageConfig"],
  },
  {
    key: "sources",
    label: "来源库",
    description: "来源抓取 + 版本",
    models: ["Source", "SourceVersion"],
  },
  {
    key: "workflows",
    label: "工作流",
    description: "工作流运行记录",
    models: ["WorkflowRun"],
  },
  {
    key: "users",
    label: "账号",
    description: "用户（含密码哈希）——还原库需与备份库同一 ENCRYPTION_KEY",
    models: ["User"],
  },
];

/** 整站备份额外附带的表（不属于任何勾选域）：系统 KV 设置。
 * 还原时原样 upsert 回 SystemSetting（含 WebDAV 备份目标的密文密码）。 */
const SYSTEM_MODEL = "SystemSetting" as const;

const ALL_MODELS = new Set<string>([...BACKUP_DOMAINS.flatMap((d) => d.models), SYSTEM_MODEL]);

/** 还原顺序：父表在前、子表在后（满足外键依赖）。
 * 关键外键：Article.siteConfigId → WordPressConfig、ArticlePublish.configId → WordPressConfig、
 * WeChatPublish.configId → WeChatConfig、ArticleVersion/SeoReport → Article。
 * WordPressConfig/WeChatConfig 必须先于 Article 还原（真实事故：文章带 siteConfigId 还原时外键违规）。
 * overwrite 模式的删除顺序 = 本数组反排，同样成立。SystemSetting 是无外键 KV，放最后。 */
export const RESTORE_ORDER: BackupModel[] = [
  "User",
  "AIProvider",
  "AIModel",
  "AITaskRoute",
  "Prompt",
  "WordPressConfig",
  "WeChatConfig",
  "Article",
  "AIGeneration",
  "ArticleVersion",
  "ArticlePublish",
  "SeoReport",
  "WeChatPublish",
  "RelayApiKey",
  "WorkflowRun",
  "Source",
  "SourceVersion",
  "StorageConfig",
  "SystemSetting",
];

/** 跨域外键预检：子表行引用的父表不在备份中时，提前给出可操作的中文提示，
 * 避免直接暴露数据库级外键报错（如只备份「文章」域而未勾「发布配置」域）。
 * 同时被 RESTORE_ORDER 顺序回归测试消费：parent 必须排在 child 之前。 */
export const FK_PRECHECK: Array<{
  child: BackupModel;
  parent: BackupModel;
  field: string;
  hint: string;
}> = [
  {
    child: "Article",
    parent: "WordPressConfig",
    field: "siteConfigId",
    hint: "文章关联的 WordPress 站点配置",
  },
  {
    child: "ArticlePublish",
    parent: "WordPressConfig",
    field: "configId",
    hint: "发布记录关联的 WordPress 站点配置",
  },
  {
    child: "WeChatPublish",
    parent: "WeChatConfig",
    field: "configId",
    hint: "公众号草稿记录关联的公众号账号",
  },
  { child: "ArticleVersion", parent: "Article", field: "articleId", hint: "历史版本关联的文章" },
  { child: "SeoReport", parent: "Article", field: "articleId", hint: "SEO 报告关联的文章" },
];

/** 预检：备份中子表行引用了未包含在备份里的父表数据 → 中文报错（不触发任何写入） */
export function precheckForeignRefs(backup: BackupFile): void {
  for (const { child, parent, field, hint } of FK_PRECHECK) {
    const childRows = backup.data[child];
    if (!Array.isArray(childRows) || childRows.length === 0) continue;
    const hasRef = childRows.some(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        typeof row[field] === "string" &&
        row[field] !== "",
    );
    if (!hasRef) continue;
    if (!(parent in backup.data)) {
      throw new BackupError(
        `备份不完整：${hint}（${child}.${field}）不在备份中。` +
          `请用包含对应域的备份重新还原：文章/发布记录类请勾选「文章」+「发布配置」域，或直接整站备份`,
      );
    }
  }
}

export interface BackupFile {
  format: "acs-backup";
  formatVersion: number;
  exportedAt: string;
  full: boolean;
  domains: string[];
  /** 模型名 → 记录数组（Prisma 字段名，DateTime 为 ISO 字符串） */
  data: Record<string, Array<Record<string, unknown>>>;
}

export interface BackupResult {
  backup: BackupFile;
  tableCounts: Record<string, number>;
  totalRows: number;
}

export class BackupError extends Error {}

export function resolveDomains(input: { full?: boolean; domains?: string[] }): {
  full: boolean;
  domains: string[];
} {
  if (input.full === true) {
    return { full: true, domains: BACKUP_DOMAINS.map((d) => d.key) };
  }
  const domains = Array.isArray(input.domains) ? input.domains : [];
  if (domains.length === 0) {
    throw new BackupError("请至少勾选一个备份范围");
  }
  const valid = BACKUP_DOMAINS.map((d) => d.key);
  const unknown = domains.filter((d) => !valid.includes(d));
  if (unknown.length > 0) {
    throw new BackupError("包含未知的备份范围");
  }
  return { full: false, domains: [...new Set(domains)] };
}

async function exportModel(
  prisma: PrismaClient,
  model: BackupModel,
): Promise<Array<Record<string, unknown>>> {
  const delegateName = DELEGATES[model];
  const delegate = (prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[
    delegateName
  ];
  if (!delegate) throw new BackupError(`内部错误：模型 ${model} 缺少 Prisma delegate`);
  const rows = (await delegate.findMany()) as Array<Record<string, unknown>>;
  return rows;
}

/** 导出时附带 SystemSetting KV（自动备份开关/目标等）——无 FK 依赖，仅随系统表进出 */
export async function exportSystemSetting(
  prisma: PrismaClient,
): Promise<Array<Record<string, unknown>>> {
  const rows = (await (
    prisma as unknown as {
      systemSetting: {
        findMany: (a?: unknown) => Promise<unknown[]>;
      };
    }
  ).systemSetting.findMany()) as Array<Record<string, unknown>>;
  return rows;
}

/** 备份：对所选域的每张表全量导出（DateTime 序列化为 ISO 字符串）；
 * 整站备份额外附带 SystemSetting KV（WebDAV 备份目标等）。 */
export async function createBackup(
  prisma: PrismaClient,
  input: { full?: boolean; domains?: string[] },
): Promise<BackupResult> {
  const { full, domains } = resolveDomains(input);
  const models = domains.flatMap((d) => BACKUP_DOMAINS.find((x) => x.key === d)?.models ?? []);
  const data: BackupFile["data"] = {};
  const tableCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const model of models) {
    const rows = await exportModel(prisma, model);
    data[model] = rows;
    tableCounts[model] = rows.length;
    totalRows += rows.length;
  }
  if (full) {
    const rows = await exportSystemSetting(prisma);
    data.SystemSetting = rows;
    tableCounts.SystemSetting = rows.length;
    totalRows += rows.length;
  }
  const backup: BackupFile = {
    format: "acs-backup",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    full,
    domains,
    data,
  };
  return { backup, tableCounts, totalRows };
}

/** 校验备份文件结构（magic/版本/表名白名单/行结构） */
export function validateBackup(backup: unknown): asserts backup is BackupFile {
  if (backup === null || typeof backup !== "object") {
    throw new BackupError("不是有效的备份文件");
  }
  const b = backup as Partial<BackupFile>;
  if (b.format !== "acs-backup") {
    throw new BackupError("不是本系统的备份文件");
  }
  if (typeof b.formatVersion !== "number") {
    throw new BackupError("备份文件版本缺失");
  }
  if (b.data === null || typeof b.data !== "object" || Array.isArray(b.data)) {
    throw new BackupError("备份文件缺少数据内容");
  }
  for (const [model, rows] of Object.entries(b.data)) {
    if (!ALL_MODELS.has(model)) {
      throw new BackupError(`备份包含未知数据表：${model}`);
    }
    if (!Array.isArray(rows)) {
      throw new BackupError(`表 ${model} 数据格式不正确`);
    }
    for (const row of rows) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw new BackupError(`表 ${model} 包含非法行`);
      }
    }
  }
}

export type BackupRestoreMode = "merge" | "overwrite";

export interface BackupRestoreTableResult {
  model: string;
  rows: number;
}

export interface BackupRestoreResult {
  restored: boolean;
  mode: BackupRestoreMode;
  tables: BackupRestoreTableResult[];
  totalRows: number;
  /** 非致命警告：如密文字段在当前 ENCRYPTION_KEY 下无法解密（配置将不可用需重填） */
  warnings?: string[];
}

function delegateFor(prisma: PrismaClient, model: BackupModel) {
  const delegateName = DELEGATES[model];
  const delegate = (prisma as unknown as Record<string, unknown>)[delegateName] as
    | {
        findMany: () => Promise<unknown[]>;
        deleteMany: () => Promise<unknown>;
        createMany: (a: { data: unknown[] }) => Promise<unknown>;
        upsert: (a: {
          where: { id: string };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => Promise<unknown>;
      }
    | undefined;
  if (!delegate) throw new BackupError(`内部错误：模型 ${model} 缺少 Prisma delegate`);
  return delegate;
}

function systemSettingDelegateFor(prisma: PrismaClient) {
  const delegate = (prisma as unknown as Record<string, unknown>).systemSetting as
    | {
        findMany: () => Promise<unknown[]>;
        deleteMany: () => Promise<unknown>;
        upsert: (a: {
          where: { key: string };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => Promise<unknown>;
      }
    | undefined;
  if (!delegate) throw new BackupError("内部错误：SystemSetting 缺少 Prisma delegate");
  return delegate;
}

/** 还原 SystemSetting KV：merge 按 key upsert（同名覆盖、其余保留）；
 * overwrite 由调用方先 deleteMany 后逐行 upsert（结果=备份快照，KV 行数有限）。 */
async function restoreSystemSetting(
  prisma: PrismaClient,
  rows: Array<Record<string, unknown>>,
  mode: BackupRestoreMode,
): Promise<number> {
  const delegate = systemSettingDelegateFor(prisma);
  if (mode === "overwrite") {
    await delegate.deleteMany();
  }
  let count = 0;
  for (const row of rows) {
    const key = row.key;
    if (typeof key !== "string" || key.length === 0) {
      throw new BackupError("SystemSetting 存在缺少 key 的行");
    }
    await delegate.upsert({ where: { key }, update: row, create: row });
    count += 1;
  }
  return count;
}

/** 还原后密文解密自检：抽验备份中的密文字段能否在当前环境解密。
 * 不能解密几乎总是 ENCRYPTION_KEY 与备份来源不一致——S3 SecretKey/AI Key 等
 * 会全部失效（现象：测试连接 AccessDenied、AI 调用失败），提前明确告知。 */
function encryptionSanityWarnings(backup: BackupFile): string[] {
  const candidates: Array<{ model: BackupModel; field: string; label: string }> = [
    { model: "StorageConfig", field: "secretKey", label: "对象存储 SecretKey" },
    { model: "AIProvider", field: "apiKey", label: "AI 供应商 API Key" },
    { model: "WeChatConfig", field: "appSecret", label: "公众号 AppSecret" },
  ];
  for (const { model, field, label } of candidates) {
    const rows = backup.data[model];
    if (!Array.isArray(rows)) continue;
    const cipher = rows.find(
      (r) => r !== null && typeof r === "object" && typeof r[field] === "string" && r[field] !== "",
    )?.[field] as string | undefined;
    if (!cipher) continue;
    try {
      decrypt(cipher);
      return [];
    } catch {
      return [
        `备份中的加密字段（${label} 等）无法在当前环境解密：当前 ENCRYPTION_KEY 与备份来源不一致。` +
          `对象存储/AI 供应商等密文配置将不可用，请到对应设置页重新填写密钥`,
      ];
    }
  }
  return [];
}

/** 还原：merge 按主键合并覆盖（逐行 upsert，可重跑）；overwrite 事务内清空后写入快照。
 * SystemSetting KV（自动备份/WebDAV 目标等）随整站备份进出：merge 按 key upsert，overwrite 清后重写。 */
export async function restoreBackup(
  prisma: PrismaClient,
  backup: unknown,
  mode: BackupRestoreMode = "merge",
): Promise<BackupRestoreResult> {
  validateBackup(backup);
  precheckForeignRefs(backup);
  const warnings = encryptionSanityWarnings(backup);
  const tablesInBackup = Object.keys(backup.data).filter(
    (t) => Array.isArray(backup.data[t]) && t in DELEGATES,
  ) as BackupModel[];
  const systemRows = Array.isArray(backup.data.SystemSetting)
    ? (backup.data.SystemSetting as Array<Record<string, unknown>>)
    : [];

  const tablesResult: BackupRestoreTableResult[] = [];
  let totalRows = 0;

  if (mode === "overwrite") {
    const deleteOrder = [...tablesInBackup].sort(
      (a, b) => RESTORE_ORDER.indexOf(b) - RESTORE_ORDER.indexOf(a),
    );
    try {
      await prisma.$transaction(async (tx) => {
        for (const model of deleteOrder) {
          const delegate = delegateFor(tx as unknown as PrismaClient, model);
          await delegate.deleteMany();
        }
        for (const model of RESTORE_ORDER) {
          const rows = backup.data[model];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          if (model === "SystemSetting") {
            const n = await restoreSystemSetting(tx as unknown as PrismaClient, rows, "overwrite");
            tablesResult.push({ model, rows: n });
            totalRows += n;
            continue;
          }
          const delegate = delegateFor(tx as unknown as PrismaClient, model);
          await delegate.createMany({ data: rows });
          tablesResult.push({ model, rows: rows.length });
          totalRows += rows.length;
        }
      });
    } catch (e) {
      throw new BackupError(
        `覆盖还原失败：${e instanceof Error ? e.message : String(e)}。建议整站备份后覆盖还原，或改用合并覆盖`,
      );
    }
    return { restored: true, mode, tables: tablesResult, totalRows, warnings };
  }

  // merge：逐行按主键 upsert（同名覆盖、其余保留、可重复还原）
  try {
    for (const model of RESTORE_ORDER) {
      const rows = backup.data[model];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      if (model === "SystemSetting") {
        const n = await restoreSystemSetting(prisma, rows, "merge");
        tablesResult.push({ model, rows: n });
        totalRows += n;
        continue;
      }
      const delegate = delegateFor(prisma, model);
      let count = 0;
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        if (typeof record.id !== "string" || record.id.length === 0) {
          throw new BackupError(`表 ${model} 存在缺少 id 的行`);
        }
        await delegate.upsert({ where: { id: record.id }, update: record, create: record });
        count += 1;
      }
      tablesResult.push({ model, rows: count });
      totalRows += count;
    }
  } catch (e) {
    if (e instanceof BackupError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    if (/Unique constraint/i.test(message)) {
      throw new BackupError(`合并还原遇到唯一字段冲突（${message.slice(0, 120)}）：可改用覆盖还原`);
    }
    throw new BackupError(`合并还原失败：${message.slice(0, 200)}`);
  }
  return { restored: true, mode, tables: tablesResult, totalRows, warnings };
}
