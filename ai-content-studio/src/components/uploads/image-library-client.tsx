"use client";

import {
  Copy as CopyIcon,
  Download as DownloadIcon,
  ImageUp as ImageUpIcon,
  RotateCcw as RotateCcwIcon,
  Trash2 as Trash2Icon,
  Upload as UploadIcon,
} from "lucide-react";
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
interface BatchItemResult {
  id: string;
  ok: boolean;
  error?: string;
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
  // 四个区的勾选集合（id 与后端参数同名：本地 name、云端 key）
  const [localSel, setLocalSel] = useState<string[]>([]);
  const [remoteSel, setRemoteSel] = useState<string[]>([]);
  const [trashSel, setTrashSel] = useState<string[]>([]);
  const [remoteTrashSel, setRemoteTrashSel] = useState<string[]>([]);
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

  /** 批量恢复/彻底删除（本地回收站） */
  async function batchTrashOp(
    op: "restore" | "purge",
    names: string[],
    successHint: string,
    clearSel: () => void,
  ) {
    try {
      const results = await postJson("/api/uploads/trash", { op, names });
      showBatchResult(results, successHint);
      clearSel();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 批量恢复/彻底删除（云端回收站） */
  async function batchRemoteTrashOp(
    op: "restore" | "purge",
    keys: string[],
    successHint: string,
    clearSel: () => void,
  ) {
    try {
      const results = await postJson("/api/storage/images/trash", { op, keys });
      showBatchResult(results, successHint);
      clearSel();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function restoreTrash(id: string) {
    void batchTrashOp("restore", [id], "图片已恢复到本地图片库", () => setTrashSel([]));
  }

  function purgeTrash(id: string) {
    if (!window.confirm(`彻底删除 ${id}？此操作不可恢复。`)) return;
    void batchTrashOp("purge", [id], "已彻底删除", () => setTrashSel([]));
  }

  function restoreRemoteTrash(id: string) {
    void batchRemoteTrashOp("restore", [id], "图片已恢复到云端图片库", () => setRemoteTrashSel([]));
  }

  function purgeRemoteTrash(id: string) {
    if (!window.confirm(`彻底删除 ${id}？此操作不可恢复。`)) return;
    void batchRemoteTrashOp("purge", [id], "已彻底删除", () => setRemoteTrashSel([]));
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

      <ImageBatchGrid
        title="回收站"
        count={trash.length}
        emptyText="回收站是空的。"
        trashStyle
        entries={trash.map<BatchGridEntry>((entry) => ({
          id: entry.id,
          url: entry.url,
          alt: entry.id,
          caption: (
            <p className="text-xs text-muted-foreground" data-testid="trash-expires">
              {formatTime(entry.deletedAt)} 删除 ·{" "}
              <span className={entry.daysLeft <= 3 ? "text-destructive" : ""}>
                {entry.daysLeft > 0 ? `${entry.daysLeft} 天后自动清除` : "即将自动清除"}
              </span>
            </p>
          ),
        }))}
        selectedIds={trashSel}
        onSelectionChange={setTrashSel}
        batchActions={[
          {
            label: "批量恢复",
            onClick: (ids) => {
              void batchTrashOp("restore", ids, "批量恢复成功", () => setTrashSel([]));
            },
          },
          {
            label: "批量彻底删除",
            danger: true,
            onClick: (ids) => {
              if (window.confirm(`彻底删除选中的 ${ids.length} 张图片？此操作不可恢复。`)) {
                void batchTrashOp("purge", ids, "批量彻底删除成功", () => setTrashSel([]));
              }
            },
          },
        ]}
        cardActions={(entry) => (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="恢复图片"
              title="恢复"
              onClick={() => restoreTrash(entry.id)}
              data-testid={`trash-restore-${entry.id}`}
            >
              <RotateCcwIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="彻底删除图片"
              title="彻底删除"
              onClick={() => purgeTrash(entry.id)}
              data-testid={`trash-purge-${entry.id}`}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </>
        )}
        gridTestId="trash-grid"
        itemTestIdPrefix="trash-image"
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

          <ImageBatchGrid
            title="云端回收站"
            count={remoteTrash.length}
            emptyText="云端回收站是空的。"
            trashStyle
            entries={remoteTrash.map<BatchGridEntry>((entry) => ({
              id: entry.id,
              url: entry.url,
              alt: entry.id,
              caption: (
                <p className="text-xs text-muted-foreground" data-testid="trash-expires-remote">
                  {formatTime(entry.deletedAt)} 删除 ·{" "}
                  <span className={entry.daysLeft <= 3 ? "text-destructive" : ""}>
                    {entry.daysLeft > 0 ? `${entry.daysLeft} 天后自动清除` : "即将自动清除"}
                  </span>
                </p>
              ),
            }))}
            selectedIds={remoteTrashSel}
            onSelectionChange={setRemoteTrashSel}
            batchActions={[
              {
                label: "批量恢复",
                onClick: (ids) => {
                  void batchRemoteTrashOp("restore", ids, "批量恢复成功", () =>
                    setRemoteTrashSel([]),
                  );
                },
              },
              {
                label: "批量彻底删除",
                danger: true,
                onClick: (ids) => {
                  if (window.confirm(`彻底删除选中的 ${ids.length} 张图片？此操作不可恢复。`)) {
                    void batchRemoteTrashOp("purge", ids, "批量彻底删除成功", () =>
                      setRemoteTrashSel([]),
                    );
                  }
                },
              },
            ]}
            cardActions={(entry) => (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="恢复图片"
                  title="恢复"
                  onClick={() => restoreRemoteTrash(entry.id)}
                  data-testid={`trash-restore-${entry.id}`}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="彻底删除图片"
                  title="彻底删除"
                  onClick={() => purgeRemoteTrash(entry.id)}
                  data-testid={`trash-purge-${entry.id}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </>
            )}
            gridTestId="remote-trash-grid"
            itemTestIdPrefix="remote-trash-image"
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
