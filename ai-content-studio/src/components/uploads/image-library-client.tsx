"use client";

import {
  Copy as CopyIcon,
  Download as DownloadIcon,
  ImageUp as ImageUpIcon,
  Trash2 as Trash2Icon,
  Upload as UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { absoluteUrl, formatSize, formatTime } from "./image-format";
import { ImageTrashSection, type TrashImageEntry } from "./image-trash-section";

export interface LocalImageEntry {
  name: string;
  url: string;
  size: number;
  mtime: string;
}

export interface RemoteImageEntry {
  key: string;
  url: string;
  size: number;
  mtime: string;
}

export interface ArticleImageGroup {
  articleId: string;
  title: string;
  images: Array<{ src: string; local: boolean }>;
}

/** 图片库：本地图片 + 回收站 + 云端图片（含云端回收站）+ 文章图片聚合 */
export function ImageLibraryClient() {
  const [localImages, setLocalImages] = useState<LocalImageEntry[]>([]);
  const [articleGroups, setArticleGroups] = useState<ArticleImageGroup[]>([]);
  const [remoteImages, setRemoteImages] = useState<RemoteImageEntry[]>([]);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [trash, setTrash] = useState<TrashImageEntry[]>([]);
  const [remoteTrash, setRemoteTrash] = useState<TrashImageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [localRes, articleRes, remoteRes, trashRes] = await Promise.all([
        fetch("/api/uploads"),
        fetch("/api/uploads/article-images"),
        fetch("/api/storage/images"),
        fetch("/api/uploads/trash"),
      ]);
      if (!localRes.ok || !articleRes.ok || !trashRes.ok) throw new Error("加载图片库失败");
      setLocalImages((await localRes.json()) as LocalImageEntry[]);
      setArticleGroups((await articleRes.json()) as ArticleImageGroup[]);
      setTrash((await trashRes.json()) as TrashImageEntry[]);
      // 云端区容错：对象存储接口失败只影响云端区，不拖垮图片库
      try {
        const remote = (await remoteRes.json()) as {
          enabled?: boolean;
          name?: string;
          images?: RemoteImageEntry[];
        };
        setRemoteEnabled(remote.enabled ?? false);
        setRemoteName(remote.name ?? "");
        setRemoteImages(remote.images ?? []);
        if (remote.enabled) {
          const rt = (await (await fetch("/api/storage/images/trash")).json()) as {
            images?: TrashImageEntry[];
          };
          setRemoteTrash(rt.images ?? []);
        } else {
          setRemoteTrash([]);
        }
      } catch {
        setRemoteEnabled(false);
        setRemoteName("");
        setRemoteImages([]);
        setRemoteTrash([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh 为组件内函数，仅挂载时执行一次
  useEffect(() => {
    void refresh();
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/image", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "上传失败");
      await refresh();
    } catch (e) {
      setError(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(absoluteUrl(url));
      setCopyHint(`已复制：${absoluteUrl(url)}`);
    } catch {
      setCopyHint("复制失败：浏览器不支持剪贴板，请手动复制");
    }
  }

  /** 删除本地图片：进回收站（14 天后自动清除） */
  async function removeImage(entry: LocalImageEntry) {
    if (!confirm(`确认删除图片 ${entry.name}？将移入回收站，14 天后自动清除。`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/uploads/${entry.name}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      await refresh();
    } catch (e) {
      setError(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function importExternal(src: string) {
    setError(null);
    try {
      const res = await fetch("/api/uploads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: src }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "转存失败");
      setCopyHint(`已转存到本地图片库：${absoluteUrl(data.url ?? "")}`);
      await refresh();
    } catch (e) {
      setError(`转存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 删除云端图片：进回收站前缀（14 天后自动清除） */
  async function deleteRemote(img: RemoteImageEntry) {
    if (!window.confirm(`确定删除云端图片 ${img.key}？将移入回收站，14 天后自动清除。`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/storage/images/${encodeURIComponent(img.key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      await refresh();
    } catch (e) {
      setError(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function postTrashOp(url: string, body: Record<string, string>, successHint: string) {
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "操作失败");
      setCopyHint(successHint);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function restoreTrash(entry: TrashImageEntry) {
    void postTrashOp(
      "/api/uploads/trash",
      { op: "restore", name: entry.id },
      "图片已恢复到本地图片库",
    );
  }

  function purgeTrash(entry: TrashImageEntry) {
    if (!window.confirm(`彻底删除 ${entry.id}？此操作不可恢复。`)) return;
    void postTrashOp("/api/uploads/trash", { op: "purge", name: entry.id }, "已彻底删除");
  }

  function restoreRemoteTrash(entry: TrashImageEntry) {
    void postTrashOp(
      "/api/storage/images/trash",
      { op: "restore", key: entry.id },
      "图片已恢复到云端图片库",
    );
  }

  function purgeRemoteTrash(entry: TrashImageEntry) {
    if (!window.confirm(`彻底删除 ${entry.id}？此操作不可恢复。`)) return;
    void postTrashOp("/api/storage/images/trash", { op: "purge", key: entry.id }, "已彻底删除");
  }

  return (
    <div className="space-y-8" data-testid="image-library">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">图片库</h2>
          <p className="text-sm text-muted-foreground">
            编辑器粘贴/上传的图片自动入库；删除的图片在回收站保留 14 天。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            data-testid="image-upload-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="image-upload-btn"
          >
            <UploadIcon className="size-4" /> {uploading ? "上传中…" : "上传图片"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {copyHint && (
        <p className="text-sm text-emerald-600" data-testid="copy-hint">
          {copyHint}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">
          本地图片
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            （{localImages.length}）
          </span>
        </h3>
        {localImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有本地图片：编辑器粘贴或上传的图片会自动出现在这里。
          </p>
        ) : (
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
            data-testid="local-grid"
          >
            {localImages.map((img) => (
              <div
                key={img.name}
                className="space-y-1 rounded-md border p-2"
                data-testid="local-image"
              >
                {/* biome-ignore lint/performance/noImgElement: 图片库缩略图使用原生 img，next/image 需配置域名 */}
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-28 w-full rounded object-cover"
                  loading="lazy"
                />
                <p className="truncate text-xs text-muted-foreground">
                  {formatSize(img.size)} · {formatTime(img.mtime)}
                </p>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="复制公网链接"
                    onClick={() => void copyUrl(img.url)}
                    data-testid={`copy-${img.name}`}
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="删除图片"
                    onClick={() => void removeImage(img)}
                    data-testid={`delete-${img.name}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ImageTrashSection
        title="回收站"
        entries={trash}
        onRestore={restoreTrash}
        onPurge={purgeTrash}
      />

      {remoteEnabled && (
        <>
          <section className="space-y-3" data-testid="remote-section">
            <h3 className="text-base font-semibold">
              云端图片（{remoteName}）
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                （{remoteImages.length}）
              </span>
            </h3>
            {remoteImages.length === 0 ? (
              <p className="text-sm text-muted-foreground">对象存储中还没有图片。</p>
            ) : (
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
                data-testid="remote-grid"
              >
                {remoteImages.map((img) => (
                  <div
                    key={img.key}
                    className="space-y-1 rounded-md border p-2"
                    data-testid="remote-image"
                  >
                    {/* biome-ignore lint/performance/noImgElement: 图片库缩略图使用原生 img，next/image 需配置域名 */}
                    <img
                      src={img.url}
                      alt={img.key}
                      className="h-28 w-full rounded object-cover"
                      loading="lazy"
                    />
                    <p className="truncate text-xs text-muted-foreground">
                      {formatSize(img.size)} · {formatTime(img.mtime)}
                    </p>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="复制云端链接"
                        onClick={() => void copyUrl(img.url)}
                        data-testid={`copy-remote-${img.key}`}
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="删除云端图片"
                        onClick={() => void deleteRemote(img)}
                        data-testid={`delete-remote-${img.key}`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <ImageTrashSection
            title="云端回收站"
            entries={remoteTrash}
            onRestore={restoreRemoteTrash}
            onPurge={purgeRemoteTrash}
          />
        </>
      )}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">文章图片</h3>
        {articleGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">文章里还没有图片。</p>
        ) : (
          <div className="space-y-4" data-testid="article-groups">
            {articleGroups.map((group) => (
              <div key={group.articleId} className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">{group.title}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {group.images.map((img) => (
                    <div
                      key={img.src}
                      className="space-y-1 rounded-md border p-2"
                      data-testid="article-image"
                    >
                      {/* biome-ignore lint/performance/noImgElement: 图片库缩略图使用原生 img，next/image 需配置域名 */}
                      <img
                        src={img.src}
                        alt={img.src}
                        className="h-24 w-full rounded object-cover"
                        loading="lazy"
                      />
                      <p className="truncate text-xs text-muted-foreground">
                        {img.local ? "本地图片库" : "外部链接"}
                      </p>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="复制链接"
                          onClick={() => void copyUrl(img.src)}
                          data-testid={`copy-art-${group.articleId}`}
                        >
                          <CopyIcon className="size-4" />
                        </Button>
                        {!img.local && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="转存到本地图片库"
                            onClick={() => void importExternal(img.src)}
                            data-testid={`import-${group.articleId}`}
                          >
                            <DownloadIcon className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        <ImageUpIcon className="mr-1 inline size-3" />
        图片存于服务器 public/uploads（本地开发为
        localhost:3000/uploads/...），部署后可换对象存储；删除的图片在回收站保留 14
        天，恢复后原链接继续可用。
      </p>
    </div>
  );
}
