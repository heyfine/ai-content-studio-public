"use client";

import {
  Copy as CopyIcon,
  Download as DownloadIcon,
  ImageUp as ImageUpIcon,
  Trash2 as Trash2Icon,
  Trash as TrashIcon,
  Upload as UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type BatchBarAction, type BatchGridEntry, ImageBatchGrid } from "./image-batch-grid";
import { absoluteUrl, dayKeyOf, formatSize, formatTime } from "./image-format";

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

export interface TrashImageEntry {
  id: string;
  backend: "local" | "remote";
  url: string;
  size: number;
  deletedAt: string;
  expiresAt: string;
  daysLeft: number;
}

/** 服务端批量结果（与 batch-delete、trash 批量 op 返回一致） */
export interface BatchItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

/** 图片库主页面：本地图片 + 云端图片（按日相册）+ 文章图片聚合；回收站独立页 /images/trash */
export function ImageLibraryClient() {
  const [localImages, setLocalImages] = useState<LocalImageEntry[]>([]);
  const [articleGroups, setArticleGroups] = useState<ArticleImageGroup[]>([]);
  const [remoteImages, setRemoteImages] = useState<RemoteImageEntry[]>([]);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 两区勾选集合（id 与后端参数同名：本地 name、云端 key）
  const [localSel, setLocalSel] = useState<string[]>([]);
  const [remoteSel, setRemoteSel] = useState<string[]>([]);
  const [trashSel, setTrashSel] = useState<string[]>([]);
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
      if (!localRes.ok || !articleRes.ok) throw new Error("加载图片库失败");
      setLocalImages((await localRes.json()) as LocalImageEntry[]);
      setArticleGroups((await articleRes.json()) as ArticleImageGroup[]);
      // 回收站角标计数（本地条数；失败不拖垮页面）
      try {
        const t = (await trashRes.json()) as unknown[];
        setTrashCount(Array.isArray(t) ? t.length : 0);
      } catch {
        setTrashCount(0);
      }
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
      } catch {
        setRemoteEnabled(false);
        setRemoteName("");
        setRemoteImages([]);
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

  function showBatchResult(results: BatchItemResult[], successHint: string) {
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      setCopyHint(`${successHint}（${results.length} 张）`);
    } else {
      setError(
        `${successHint.replace(/成功|完成/, "")}完成：成功 ${results.length - failed.length} 张，失败 ${failed.length} 张` +
          (failed[0]?.error ? `，首个失败原因：${failed[0].error}` : ""),
      );
    }
  }

  async function postJson(url: string, body: unknown): Promise<BatchItemResult[]> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      results?: BatchItemResult[];
      error?: string;
    };
    if (!res.ok) throw new Error(data?.error ?? "操作失败");
    return data.results ?? [];
  }

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

  /** 单张删除本地图片：进回收站（14 天后自动清除） */
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

  /** 批量删除本地图片：进回收站 */
  async function batchDeleteLocal(names: string[]) {
    if (
      !window.confirm(`确认删除选中的 ${names.length} 张本地图片？将移入回收站，14 天后自动清除。`)
    )
      return;
    try {
      const results = await postJson("/api/uploads/batch-delete", { names });
      showBatchResult(results, "批量删除成功");
      setLocalSel([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 批量删除云端图片：进回收站前缀 */
  async function batchDeleteRemote(keys: string[]) {
    if (
      !window.confirm(`确认删除选中的 ${keys.length} 张云端图片？将移入回收站，14 天后自动清除。`)
    )
      return;
    try {
      const results = await postJson("/api/storage/images/batch-delete", { keys });
      showBatchResult(results, "批量删除成功");
      setRemoteSel([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  /** 单张删除云端图片：进回收站前缀 */
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
            variant="ghost"
            render={<Link href="/images/trash" />}
            data-testid="trash-entry-btn"
          >
            <TrashIcon className="size-4" /> 回收站
            {trashCount > 0 && (
              <span
                className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-destructive-foreground"
                data-testid="trash-count-badge"
              >
                {trashCount > 99 ? "99+" : trashCount}
              </span>
            )}
          </Button>
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

      <ImageBatchGrid
        title="本地图片"
        count={localImages.length}
        emptyText="还没有本地图片：编辑器粘贴或上传的图片会自动出现在这里。"
        entries={localImages.map<BatchGridEntry>((img) => ({
          id: img.name,
          url: img.url,
          alt: img.name,
          caption: (
            <p className="truncate text-xs text-muted-foreground">
              {formatSize(img.size)} · {formatTime(img.mtime)}
            </p>
          ),
        }))}
        selectedIds={localSel}
        onSelectionChange={setLocalSel}
        batchActions={[
          {
            label: "批量删除",
            danger: true,
            onClick: (ids) => void batchDeleteLocal(ids),
          } satisfies BatchBarAction,
        ]}
        cardActions={(entry) => (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="复制公网链接"
              onClick={() => void copyUrl(entry.url)}
              data-testid={`copy-${entry.id}`}
            >
              <CopyIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="删除图片"
              onClick={() => {
                const img = localImages.find((i) => i.name === entry.id);
                if (img) void removeImage(img);
              }}
              data-testid={`delete-${entry.id}`}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </>
        )}
        gridTestId="local-grid"
        itemTestIdPrefix="local-image"
      />

      {remoteEnabled && (
        <>
          <ImageBatchGrid
            title={<>云端图片（{remoteName}）</>}
            count={remoteImages.length}
            emptyText="对象存储中还没有图片。"
            entries={remoteImages.map<BatchGridEntry>((img) => ({
              id: img.key,
              url: img.url,
              alt: img.key,
              // 相册式按日分组（北京墙钟）
              dayLabel: dayKeyOf(img.mtime),
              caption: (
                <p className="truncate text-xs text-muted-foreground">
                  {formatSize(img.size)} · {formatTime(img.mtime)}
                </p>
              ),
            }))}
            selectedIds={remoteSel}
            onSelectionChange={setRemoteSel}
            batchActions={[
              {
                label: "批量删除",
                danger: true,
                onClick: (ids) => void batchDeleteRemote(ids),
              },
            ]}
            cardActions={(entry) => (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="复制云端链接"
                  onClick={() => void copyUrl(entry.url)}
                  data-testid={`copy-remote-${entry.id}`}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="删除云端图片"
                  onClick={() => {
                    const img = remoteImages.find((i) => i.key === entry.id);
                    if (img) void deleteRemote(img);
                  }}
                  data-testid={`delete-remote-${entry.id}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </>
            )}
            gridTestId="remote-grid"
            itemTestIdPrefix="remote-image"
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
        localhost:3000/uploads/...），部署后可换对象存储；删除的图片进入回收站（右上角按钮）保留 14
        天，恢复后原链接继续可用。
      </p>
    </div>
  );
}
