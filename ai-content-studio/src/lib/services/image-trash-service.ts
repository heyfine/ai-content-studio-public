/**
 * 图片库回收站服务：删除 = 移入回收站（本地 uploads/trash/ 子目录、云端 {keyPrefix}trash/ 前缀），
 * 14 天未处理自动清理，支持恢复与彻底删除。
 *
 * 设计约束：
 * - 零 schema 改动：回收站状态完全由文件位置表达，不建数据库表
 * - 本地：rename 进 trash/ 子目录，utimes 把 mtime 刷成删除时间（= 过期判定依据）；恢复 rename 回原位
 * - 云端：CopyObject 到 trash/ 前缀再删源（CopyObject 会把 LastModified 重置为复制时间 = 删除时间），
 *   恢复反向 Copy 回原 key；文件名段是 UUID 文件名，恢复后 URL 与文章里的引用一致
 * - trash 不计入 /api/uploads 列表：listLocalImages 按白名单只认 uploads 根目录的文件，trash 子目录天然排除
 */
import { mkdir, readdir, rename, stat, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import { LOCAL_IMAGE_NAME_RE } from "@/lib/content/image-urls";
import { uploadDir } from "./image-upload-service";
import {
  copyRemoteObject,
  deleteRemoteObject,
  getEnabledStorageConfig,
  listObjectsUnderPrefix,
  type StorageConfigRow,
} from "./storage-service";

/** 回收站保留天数（14 天未处理自动删除） */
export const TRASH_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_DIR_NAME = "trash";

export type TrashImageBackend = "local" | "remote";

/** 云端回收站前缀：{keyPrefix}trash/ */
export function remoteTrashPrefix(keyPrefix: string): string {
  return `${keyPrefix}trash/`;
}

/** 本地回收站目录：public/uploads/trash */
export function localTrashDir(): string {
  return path.join(uploadDir(), TRASH_DIR_NAME);
}

/** 过期判定纯函数：删除时间距 now 超过保留天数即过期 */
export function isExpired(deletedAt: Date | string, now: Date = new Date()): boolean {
  const t = typeof deletedAt === "string" ? new Date(deletedAt).getTime() : deletedAt.getTime();
  return now.getTime() - t > TRASH_RETENTION_DAYS * DAY_MS;
}

export interface TrashImageEntry {
  /** 本地为图片文件名（uuid.ext），云端为完整对象 key（acs/trash/x.png） */
  id: string;
  backend: TrashImageBackend;
  /** 当前可访问的缩略图地址（回收站中的位置） */
  url: string;
  size: number;
  /** 删除时间 ISO 串 */
  deletedAt: string;
  /** 自动清理时间 ISO 串 */
  expiresAt: string;
  /** 剩余天数（向上取整，最小 0） */
  daysLeft: number;
}

function toEntry(
  backend: TrashImageBackend,
  id: string,
  size: number,
  deletedAt: Date,
  url: string,
): TrashImageEntry {
  const now = new Date();
  const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
  return {
    backend,
    id,
    size,
    deletedAt: deletedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    daysLeft,
    url,
  };
}

// ---------- 本地（public/uploads） ----------

/** 列出本地回收站图片（trash/ 子目录，mtime = 删除时间），按删除时间倒序 */
export async function listLocalTrash(): Promise<TrashImageEntry[]> {
  const dir = localTrashDir();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return []; // 目录尚不存在 = 回收站为空
  }
  const entries: TrashImageEntry[] = [];
  for (const name of names) {
    if (!LOCAL_IMAGE_NAME_RE.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const s = await stat(full);
      if (!s.isFile()) continue;
      entries.push(toEntry("local", name, s.size, s.mtime, `/uploads/${TRASH_DIR_NAME}/${name}`));
    } catch {
      // 并发清理竞态：跳过
    }
  }
  return entries.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

/** 本地图片移入回收站：rename 进 trash/ 并刷新 mtime 为删除时间；文件不存在/非法名返回 false */
export async function trashLocalImage(name: string): Promise<boolean> {
  if (!LOCAL_IMAGE_NAME_RE.test(name)) return false;
  const src = path.join(uploadDir(), name);
  const dst = path.join(localTrashDir(), name);
  try {
    await mkdir(path.dirname(dst), { recursive: true });
    await rename(src, dst);
    await utimes(dst, new Date(), new Date());
    return true;
  } catch {
    return false;
  }
}

/** 恢复本地图片：rename 回 uploads 根目录，URL 恢复为 /uploads/<name> */
export async function restoreLocalImage(name: string): Promise<boolean> {
  if (!LOCAL_IMAGE_NAME_RE.test(name)) return false;
  try {
    await rename(path.join(localTrashDir(), name), path.join(uploadDir(), name));
    return true;
  } catch {
    return false;
  }
}

/** 彻底删除本地回收站图片（物理删除文件） */
export async function purgeLocalImage(name: string): Promise<boolean> {
  if (!LOCAL_IMAGE_NAME_RE.test(name)) return false;
  try {
    await unlink(path.join(localTrashDir(), name));
    return true;
  } catch {
    return false;
  }
}

/** 清理本地回收站中已过 14 天的图片，返回清理数量 */
export async function purgeExpiredLocal(now: Date = new Date()): Promise<number> {
  let purged = 0;
  for (const entry of await listLocalTrash()) {
    if (isExpired(entry.deletedAt, now) && (await purgeLocalImage(entry.id))) {
      purged += 1;
    }
  }
  return purged;
}

// ---------- 云端（S3 兼容对象存储） ----------

/** 列出云端回收站图片（trash/ 前缀，LastModified = 删除时间），按删除时间倒序 */
export async function listRemoteTrash(row: StorageConfigRow): Promise<TrashImageEntry[]> {
  const prefix = remoteTrashPrefix(row.keyPrefix);
  const objects = await listObjectsUnderPrefix(row, prefix);
  return objects
    .filter((o) => o.key.startsWith(prefix) && o.key !== prefix)
    .map((o) => toEntry("remote", o.key, o.size, new Date(o.mtime), o.url));
}

/** 云端图片移入回收站：Copy 到 trash/ 前缀（LastModified 重置为删除时间）后删除源对象 */
export async function trashRemoteImage(row: StorageConfigRow, key: string): Promise<void> {
  if (!key.startsWith(row.keyPrefix) || key.includes("..")) {
    throw new Error(`仅允许移入本应用前缀下的对象：${key}`);
  }
  if (key.startsWith(remoteTrashPrefix(row.keyPrefix))) {
    throw new Error("对象已在回收站中");
  }
  const toKey = `${remoteTrashPrefix(row.keyPrefix)}${key.slice(row.keyPrefix.length)}`;
  await copyRemoteObject(row, key, toKey);
  await deleteRemoteObject(row, key);
}

/** 恢复云端图片：Copy 回原 key 后删除回收站对象，URL 恢复原样 */
export async function restoreRemoteImage(row: StorageConfigRow, key: string): Promise<void> {
  const prefix = remoteTrashPrefix(row.keyPrefix);
  if (!key.startsWith(prefix) || key.includes("..")) {
    throw new Error(`仅允许恢复回收站内的对象：${key}`);
  }
  const baseKey = key.slice(prefix.length);
  if (!baseKey) throw new Error("回收站对象 key 不合法");
  const toKey = `${row.keyPrefix}${baseKey}`;
  await copyRemoteObject(row, key, toKey);
  await deleteRemoteObject(row, key);
}

/** 彻底删除云端回收站对象 */
export async function purgeRemoteImage(row: StorageConfigRow, key: string): Promise<void> {
  const prefix = remoteTrashPrefix(row.keyPrefix);
  if (!key.startsWith(prefix) || key.includes("..")) {
    throw new Error(`仅允许彻底删除回收站内的对象：${key}`);
  }
  await deleteRemoteObject(row, key);
}

/** 清理云端回收站中已过 14 天的对象，返回清理数量；单个失败不阻塞其余（下轮重试） */
export async function purgeExpiredRemote(
  row: StorageConfigRow,
  now: Date = new Date(),
): Promise<number> {
  let purged = 0;
  for (const entry of await listRemoteTrash(row)) {
    if (!isExpired(entry.deletedAt, now)) continue;
    try {
      await deleteRemoteObject(row, entry.id);
      purged += 1;
    } catch {
      // 跳过失败对象，下一轮调度重试
    }
  }
  return purged;
}

// ---------- 调度入口 ----------

export interface PurgeExpiredResult {
  local: number;
  remote: number;
  /** 云端未启用对象存储时跳过 */
  remoteSkipped: boolean;
}

/** 清理两端过期的回收站图片（调度器与「立即清理」共用） */
export async function purgeExpiredImages(now: Date = new Date()): Promise<PurgeExpiredResult> {
  const local = await purgeExpiredLocal(now);
  const storage = await getEnabledStorageConfig();
  if (!storage) {
    return { local, remote: 0, remoteSkipped: true };
  }
  const remote = await purgeExpiredRemote(storage, now);
  return { local, remote, remoteSkipped: false };
}
