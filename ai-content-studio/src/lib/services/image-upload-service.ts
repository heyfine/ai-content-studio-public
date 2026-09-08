/**
 * 图片上传服务：双后端分流——启用 S3 兼容对象存储时新图直传云桶（URL 直出公网），
 * 未配置或未启用时保持本地 public/uploads 落盘。调用方（上传/转存 API、粘贴扩展）零改动。
 * 落盘文件名 = randomUUID + 白名单扩展名；列表/删除均有类型与命名校验。
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_IMAGE_NAME_RE } from "@/lib/content/image-urls";
import { getEnabledStorageConfig, putObject } from "@/lib/services/storage-service";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export function uploadDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

export function imageTypeAllowed(type: string): string | null {
  return EXT_BY_TYPE[type] ?? null;
}

async function writeLocal(type: string, ext: string, bytes: Uint8Array): Promise<string> {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, filename), bytes);
  return `/uploads/${filename}`;
}

/** 保存图片字节：启用对象存储则直传云桶返回公网 URL，否则本地落盘返回相对路径 */
export async function saveImageFile(type: string, bytes: Uint8Array): Promise<string> {
  const ext = imageTypeAllowed(type);
  if (!ext) throw new Error(`不支持的图片类型：${type || "未知"}`);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片需小于 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB`);
  }
  const storage = await getEnabledStorageConfig();
  if (storage) {
    const filename = `${randomUUID()}${ext}`;
    return putObject(storage, `${storage.keyPrefix}${filename}`, bytes, type);
  }
  return writeLocal(type, ext, bytes);
}

/** 下载外部图片并转存（供文章外部图「转存到本地」；启用对象存储时转存至云桶） */
export async function importImageFromUrl(url: string): Promise<string> {
  if (!/^https?:\/\//.test(url)) throw new Error("仅支持 http(s) 图片 URL");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`图片下载失败（HTTP ${res.status}）`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = imageTypeAllowed(contentType);
  if (!ext) throw new Error(`不支持的图片类型：${contentType || "未知"}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return saveImageFile(contentType, bytes);
}

export interface LocalImageEntry {
  name: string;
  url: string;
  size: number;
  mtime: string;
}

/** 列出本地图片库全部图片（仅白名单类型） */
export async function listLocalImages(): Promise<LocalImageEntry[]> {
  const dir = uploadDir();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const entries: LocalImageEntry[] = [];
  for (const name of names) {
    if (!LOCAL_IMAGE_NAME_RE.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const s = await stat(full);
      if (!s.isFile()) continue;
      entries.push({
        name,
        url: `/uploads/${name}`,
        size: s.size,
        mtime: s.mtime.toISOString(),
      });
    } catch {
      // 并发删除等竞态：跳过
    }
  }
  return entries.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

/** 删除本地图片；文件名不合法或不存在返回 false */
export async function deleteLocalImage(name: string): Promise<boolean> {
  if (!LOCAL_IMAGE_NAME_RE.test(name)) return false;
  try {
    await unlink(path.join(uploadDir(), name));
    return true;
  } catch {
    return false;
  }
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** 服务端读取本地图片库图片（文件名白名单校验），供服务端取图场景使用（如微信发布） */
export async function readLocalImage(
  name: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  if (!LOCAL_IMAGE_NAME_RE.test(name)) throw new Error(`非法图片文件名：${name}`);
  try {
    const buf = await readFile(path.join(uploadDir(), name));
    const ext = path.extname(name).toLowerCase();
    return {
      bytes: new Uint8Array(buf),
      contentType: CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream",
    };
  } catch {
    throw new Error(`本地图库图片不存在或已被删除：/uploads/${name}`);
  }
}
