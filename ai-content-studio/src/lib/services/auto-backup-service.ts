/**
 * 自动备份：按设定间隔定时把整站备份推到「多个启用的 WebDAV 目标」。
 * 设置存 SystemSetting KV；调度由 instrumentation.ts 启动的服务器内定时器驱动
 * （每 5 分钟检查一次 nextAt，到点目标的间隔/保留份数独立管理）；可一键手动立即备份。
 * 移植自 sales record 的 auto-backup.ts，适配 Prisma + PostgreSQL。
 */
import type { PrismaClient } from ".prisma/client";
import { beijingStamp } from "@/lib/datetime";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  BackupError,
  type BackupFile,
  type BackupRestoreMode,
  type BackupRestoreResult,
  createBackup,
  restoreBackup,
} from "@/lib/services/backup-service";
import {
  getWebdav,
  listWebdav,
  putWebdav,
  removeWebdav,
  testWebdav,
  type WebdavBackupFile,
  WebdavError,
  type WebdavFetcher,
} from "@/lib/services/webdav";

const K = {
  enabled: "auto_backup_enabled",
  targets: "auto_backup_targets",
  lastAt: "auto_backup_last_at",
  lastStatus: "auto_backup_last_status",
  lastMessage: "auto_backup_last_message",
  history: "auto_backup_history",
} as const;

const DEFAULT_INTERVAL = 12;
const DEFAULT_KEEP = 7;

export interface StoredTarget {
  id: string;
  name: string;
  url: string;
  username: string;
  /** 保存于 SystemSetting，仅服务端解密使用；对外只回 hasPassword */
  password: string;
  enabled: boolean;
  intervalHours: number;
  keep: number;
  /** 下次执行时间（epoch ms；0=未调度） */
  nextAt: number;
}

export interface WebdavTargetPublic {
  id: string;
  name: string;
  url: string;
  username: string;
  hasPassword: boolean;
  enabled: boolean;
  intervalHours: number;
  keep: number;
}

export interface AutoBackupSettings {
  enabled: boolean;
  webdavTargets: WebdavTargetPublic[];
}

export interface AutoBackupStatus {
  nextBackupAt: string | null;
  lastBackupAt: string | null;
  lastBackupStatus: "ok" | "error" | null;
  lastBackupMessage: string | null;
}

interface HistoryEntry {
  target: string;
  filename: string;
  createdAt: string;
}

async function readSetting(prisma: PrismaClient, key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeSetting(prisma: PrismaClient, key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

function parseTargets(raw: string | null): StoredTarget[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (t): t is StoredTarget =>
        t !== null && typeof t === "object" && typeof (t as StoredTarget).id === "string",
    );
  } catch {
    return [];
  }
}

function toPublicTarget(t: StoredTarget): WebdavTargetPublic {
  return {
    id: t.id,
    name: t.name,
    url: t.url,
    username: t.username,
    hasPassword: t.password.length > 0,
    enabled: t.enabled,
    intervalHours: t.intervalHours,
    keep: t.keep,
  };
}

export async function getAutoBackupSettings(
  prisma: PrismaClient = defaultPrisma,
): Promise<AutoBackupSettings> {
  const enabled = (await readSetting(prisma, K.enabled)) === "1";
  const webdavTargets = parseTargets(await readSetting(prisma, K.targets)).map(toPublicTarget);
  return { enabled, webdavTargets };
}

export async function getAutoBackupStatus(
  prisma: PrismaClient = defaultPrisma,
): Promise<AutoBackupStatus> {
  const targets = parseTargets(await readSetting(prisma, K.targets)).filter((t) => t.enabled);
  const nextAtMs = targets.reduce(
    (min, t) => (t.nextAt > 0 && (min === 0 || t.nextAt < min) ? t.nextAt : min),
    0,
  );
  const lastAt = Number((await readSetting(prisma, K.lastAt)) ?? "");
  const lastStatus = ((await readSetting(prisma, K.lastStatus)) ?? "") as "ok" | "error" | "";
  const lastMessage = (await readSetting(prisma, K.lastMessage)) ?? "";
  return {
    nextBackupAt: nextAtMs > 0 ? new Date(nextAtMs).toISOString() : null,
    lastBackupAt: lastAt > 0 ? new Date(lastAt).toISOString() : null,
    lastBackupStatus: lastStatus === "ok" || lastStatus === "error" ? lastStatus : null,
    lastBackupMessage: lastMessage || null,
  };
}

export interface AutoBackupUpdateInput {
  enabled: boolean;
  targets: Array<{
    id?: string;
    name?: string;
    url?: string;
    username?: string;
    /** 传了才更新；留空沿用已存 */
    password?: string;
    enabled: boolean;
    intervalHours?: number;
    keep?: number;
  }>;
}

function assertUrl(url: string): void {
  if (!/^https?:\/\//i.test(url.trim())) {
    throw new BackupError("WebDAV 地址需以 http(s):// 开头");
  }
}

export function validateAutoBackupSettings(input: AutoBackupUpdateInput): void {
  if (typeof input.enabled !== "boolean") {
    throw new BackupError("开关字段无效");
  }
  if (!Array.isArray(input.targets)) {
    throw new BackupError("WebDAV 目标列表无效");
  }
  for (const t of input.targets) {
    if (t === null || typeof t !== "object") {
      throw new BackupError("WebDAV 目标无效");
    }
    assertUrl(t.url ?? "");
    if (!(t.username ?? "").trim()) {
      throw new BackupError("WebDAV 用户名不能为空");
    }
    const h = Number(t.intervalHours ?? DEFAULT_INTERVAL);
    if (!Number.isFinite(h) || h < 1 || h > 720) {
      throw new BackupError("该目标间隔需在 1~720 小时之间");
    }
    const k = Number(t.keep ?? DEFAULT_KEEP);
    if (!Number.isFinite(k) || k < 1) {
      throw new BackupError("该目标保留份数需 ≥ 1");
    }
  }
  if (input.enabled && !input.targets.some((t) => t.enabled)) {
    throw new BackupError("请至少启用一个 WebDAV 目标");
  }
}

export async function saveAutoBackupSettings(
  prisma: PrismaClient,
  input: AutoBackupUpdateInput,
): Promise<AutoBackupSettings> {
  validateAutoBackupSettings(input);
  const existing = parseTargets(await readSetting(prisma, K.targets));
  const now = Date.now();
  const targets: StoredTarget[] = input.targets.map((t, i) => {
    const prev = t.id ? existing.find((e) => e.id === t.id) : undefined;
    const password =
      typeof t.password === "string" && t.password.length > 0 ? t.password : (prev?.password ?? "");
    const intervalHours = Math.round(Number(t.intervalHours ?? DEFAULT_INTERVAL));
    const keep = Math.round(Number(t.keep ?? DEFAULT_KEEP));
    // 需要触发/间隔改变时重置本次调度；否则保留原 nextAt
    const intervalChanged = prev !== undefined && prev.intervalHours !== intervalHours;
    const nextAt =
      t.enabled && (prev === undefined || intervalChanged)
        ? now + intervalHours * 3600_000
        : (prev?.nextAt ?? 0);
    return {
      id: t.id ?? crypto.randomUUID(),
      name: (t.name ?? "").trim() || `WebDAV ${i + 1}`,
      url: (t.url ?? "").trim(),
      username: (t.username ?? "").trim(),
      password,
      enabled: t.enabled,
      intervalHours,
      keep,
      nextAt: t.enabled ? nextAt : 0,
    };
  });
  await writeSetting(prisma, K.targets, JSON.stringify(targets));
  await writeSetting(prisma, K.enabled, input.enabled ? "1" : "0");
  return getAutoBackupSettings(prisma);
}

export interface AutoBackupDeps {
  now?: number;
  fetchImpl?: WebdavFetcher;
  prisma?: PrismaClient;
  force?: boolean;
}

/** 备份文件名时间戳：北京墙钟（容器 TZ=Asia/Shanghai，与用户看到的系统时间一致） */
function stamp(ms: number): string {
  return beijingStamp(ms);
}

async function recordStatus(
  prisma: PrismaClient,
  ms: number,
  status: "ok" | "error",
  message: string,
) {
  await writeSetting(prisma, K.lastAt, String(ms));
  await writeSetting(prisma, K.lastStatus, status);
  await writeSetting(prisma, K.lastMessage, message);
}

async function trimHistory(
  prisma: PrismaClient,
  targets: StoredTarget[],
  filename: string,
  nowMs: number,
  fetchImpl: WebdavFetcher,
): Promise<void> {
  const raw = await readSetting(prisma, K.history);
  let history: HistoryEntry[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) history = parsed as HistoryEntry[];
  } catch {
    history = [];
  }
  history = [
    ...history,
    ...targets.map((t) => ({ target: t.id, filename, createdAt: new Date(nowMs).toISOString() })),
  ];

  // 每个目标按各自的 keep 保留最近 N 份，超量在对应 WebDAV 上删除
  const kept: HistoryEntry[] = [];
  const byTarget = new Map<string, HistoryEntry[]>();
  for (const e of history) {
    const arr = byTarget.get(e.target) ?? [];
    arr.push(e);
    byTarget.set(e.target, arr);
  }
  for (const [targetId, entries] of byTarget) {
    const target = targets.find((t) => t.id === targetId);
    const keep = target?.keep ?? DEFAULT_KEEP;
    const dropped = entries.slice(0, Math.max(0, entries.length - keep));
    const keepList = entries.slice(Math.max(0, entries.length - keep));
    kept.push(...keepList);
    if (target) {
      for (const d of dropped) {
        await removeWebdav(target.url, target.username, target.password, d.filename, fetchImpl);
      }
    }
  }
  await writeSetting(prisma, K.history, JSON.stringify(kept));
}

/** 执行一次自动备份：推到所有到点的启用目标（各目标独立 nextAt/间隔）；force 忽略定时 */
export async function runAutoBackup(deps: AutoBackupDeps = {}): Promise<{
  ran: boolean;
  reason?: string;
  message?: string;
  filename?: string;
  totalRows?: number;
}> {
  const prisma = deps.prisma ?? defaultPrisma;
  const nowMs = deps.now ?? Date.now();
  const fetchImpl = deps.fetchImpl ?? fetch;

  const settings = await getAutoBackupSettings(prisma);
  if (!settings.enabled && !deps.force) {
    return { ran: false, reason: "disabled" };
  }
  const allTargets = parseTargets(await readSetting(prisma, K.targets));
  const enabledTargets = allTargets.filter((t) => t.enabled);
  if (enabledTargets.length === 0) {
    await recordStatus(prisma, nowMs, "error", "未配置启用的 WebDAV 目标");
    if (deps.force) throw new BackupError("未配置启用的 WebDAV 目标");
    return { ran: false, reason: "not_configured", message: "未配置启用的 WebDAV 目标" };
  }
  const toRun = deps.force
    ? enabledTargets
    : enabledTargets.filter((t) => !(t.nextAt > 0 && nowMs < t.nextAt));
  if (toRun.length === 0) {
    return { ran: false, reason: "not_due" };
  }

  try {
    const { backup, totalRows } = await createBackup(prisma, { full: true });
    const filename = `acs-backup-${stamp(nowMs)}.json`;
    const results: Array<{ target: string; ok: boolean; message?: string }> = [];
    const ranTargets: StoredTarget[] = [];
    for (const t of toRun) {
      try {
        await putWebdav(t.url, t.username, t.password, filename, JSON.stringify(backup), fetchImpl);
        results.push({ target: t.name, ok: true });
        ranTargets.push(t);
        t.nextAt = nowMs + t.intervalHours * 3600_000;
      } catch (err) {
        results.push({
          target: t.name,
          ok: false,
          message: err instanceof Error ? err.message : "上传失败",
        });
      }
    }
    await writeSetting(prisma, K.targets, JSON.stringify(allTargets));
    await trimHistory(prisma, ranTargets, filename, nowMs, fetchImpl);
    const okCount = results.filter((r) => r.ok).length;
    const allOk = okCount === results.length;
    const message = allOk
      ? `备份成功 ${totalRows} 行（${results.length} 个目标）`
      : `部分目标失败（${okCount}/${results.length}）`;
    await recordStatus(prisma, nowMs, allOk ? "ok" : "error", message);
    if (okCount === 0) {
      throw new BackupError("所有 WebDAV 目标上传均失败");
    }
    return { ran: true, reason: "ok", filename, totalRows };
  } catch (err) {
    if (!(err instanceof BackupError)) {
      await recordStatus(prisma, nowMs, "error", err instanceof Error ? err.message : "备份失败");
    }
    throw err;
  }
}

async function findTarget(prisma: PrismaClient, targetId: string): Promise<StoredTarget> {
  const target = parseTargets(await readSetting(prisma, K.targets)).find((t) => t.id === targetId);
  if (!target) throw new BackupError("未找到该 WebDAV 目标");
  if (!target.password) throw new BackupError("该目标未配置密码");
  return target;
}

/** 测试某个 WebDAV 目标的连通性（按 targetId） */
export async function testWebdavTarget(
  targetId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<{ ok: boolean; status?: number; message: string | null }> {
  const target = await findTarget(prisma, targetId);
  return testWebdav(target.url, target.username, target.password);
}

/** 列出某 WebDAV 目标目录下的备份文件（按修改时间倒序） */
export async function listBackupFiles(
  targetId: string,
  prisma: PrismaClient = defaultPrisma,
  fetchImpl: WebdavFetcher = fetch,
): Promise<WebdavBackupFile[]> {
  const target = await findTarget(prisma, targetId);
  const files = await listWebdav(target.url, target.username, target.password, fetchImpl);
  return files.sort((a, b) => {
    const ta = parseWebdavTime(a.lastModified);
    const tb = parseWebdavTime(b.lastModified);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
}

function parseWebdavTime(value: string | null): number | null {
  if (value === null || value.trim().length === 0) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 从 WebDAV 取回一个备份文件并还原（merge / overwrite） */
export async function restoreFromWebdav(
  targetId: string,
  filename: string,
  mode: BackupRestoreMode,
  prisma: PrismaClient = defaultPrisma,
  fetchImpl: WebdavFetcher = fetch,
): Promise<BackupRestoreResult> {
  const target = await findTarget(prisma, targetId);
  const content = await getWebdav(
    target.url,
    target.username,
    target.password,
    filename,
    fetchImpl,
  );
  let backup: unknown;
  try {
    backup = JSON.parse(content);
  } catch {
    throw new BackupError("该文件不是有效的备份文件");
  }
  return restoreBackup(prisma, backup, mode);
}

export { WebdavError };
