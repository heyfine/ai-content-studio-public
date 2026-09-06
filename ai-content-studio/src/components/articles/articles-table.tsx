"use client";

import {
  ChevronDown as ChevronDownIcon,
  ChevronsUpDown as ChevronsUpDownIcon,
  ChevronUp as ChevronUpIcon,
  Copy as CopyIcon,
  ExternalLink as ExternalLinkIcon,
  MessageCircle as MessageCircleIcon,
  Pencil as PencilIcon,
  RefreshCw as RefreshIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ArticleRow } from "@/lib/article-types";
import { ArticleStatusBadge } from "./article-status-badge";

export interface RefreshOutcome {
  articleId: string;
  oldSeoScore: number | null;
  newSeoScore: number;
  delta: number;
}

interface ArticleTableProps {
  rows: ArticleRow[];
  configMap: Record<string, string>;
  siteUrlMap: Record<string, string>;
  selectedIds: Set<string>;
  refreshingId: string | null;
  duplicatingId: string | null;
  sendingWechatId: string | null;
  disabledIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onRefresh: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSendWechat: (id: string) => void;
  onDelete: (id: string) => void;
  sortOrder: "asc" | "desc";
  onToggleSort: () => void;
}

/** 排序指示图标 */
function SortIcon({ order }: { order: "asc" | "desc" }) {
  if (order === "asc") return <ChevronUpIcon className="size-3.5" />;
  if (order === "desc") return <ChevronDownIcon className="size-3.5" />;
  return <ChevronsUpDownIcon className="size-3.5" />;
}

/** 同步状态徽标 */
export function SyncBadge({
  status,
  lastSyncedAt,
}: {
  status: ArticleRow["syncStatus"];
  lastSyncedAt: string | null;
}) {
  if (status === "CONFLICT") {
    return (
      <span
        className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        title="检测到冲突，请手动解决"
      >
        冲突
      </span>
    );
  }
  if (status === "SYNCED") {
    return (
      <span
        className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
        title={`最后同步: ${lastSyncedAt?.slice(0, 16).replace("T", " ")}`}
      >
        已同步
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span
        className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
        title="同步失败"
      >
        失败
      </span>
    );
  }
  return null;
}

/** 文章归属标签（博客类指向 WP 文章，本地类为静态标签） */
export function ArticleOriginBadge({
  siteName,
  isLocal,
  href,
}: {
  siteName: string | null;
  isLocal: boolean;
  href: string | null;
}) {
  const label = siteName ?? "本地";
  if (isLocal || !href) {
    return (
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${
          isLocal
            ? "bg-muted text-muted-foreground"
            : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400"
        }`}
      >
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs text-sky-700 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:hover:bg-sky-900"
      title={`在 WordPress 中查看「${label}」`}
      data-testid="wp-article-link"
    >
      {label}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

function ArticleTableRow({
  r,
  siteName,
  siteHref,
  publishTargets,
  selected,
  refreshing,
  duplicating,
  sendingWechat,
  refreshDisabled,
  actionDisabled,
  onToggle,
  onRefresh,
  onDuplicate,
  onSendWechat,
  onDelete,
}: {
  r: ArticleRow;
  siteName: string | null;
  siteHref: string | null;
  publishTargets: Array<{ name: string; href: string | null }>;
  selected: boolean;
  refreshing: boolean;
  duplicating: boolean;
  sendingWechat: boolean;
  refreshDisabled: boolean;
  actionDisabled: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onDuplicate: () => void;
  onSendWechat: () => void;
  onDelete: () => void;
}) {
  const isLocal = !r.siteConfigId;

  return (
    <tr className={`border-b last:border-0 ${selected ? "bg-muted/40" : ""}`}>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`选择 ${r.title}`}
          data-testid={`row-checkbox-${r.id}`}
          className="size-4"
        />
      </td>
      <td className="px-4 py-2 text-base font-medium">{r.title}</td>
      <td className="px-4 py-2">
        <ArticleOriginBadge siteName={siteName} isLocal={isLocal} href={siteHref} />
      </td>
      <td className="px-4 py-2">
        {publishTargets.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {publishTargets.map((t, i) => (
              <span key={`${t.name}-${i}`} className="inline-flex items-center">
                {t.href ? (
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
                    title={`在 WordPress 中查看「${t.name}」`}
                    data-testid={`publish-target-${r.id}`}
                  >
                    {t.name}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {t.name}
                  </span>
                )}
                {i < publishTargets.length - 1 && <span className="text-muted-foreground">、</span>}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <ArticleStatusBadge status={r.status} />
      </td>
      <td className="px-4 py-2">
        <SyncBadge status={r.syncStatus} lastSyncedAt={r.lastSyncedAt} />
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {r.updatedAt?.slice(0, 16).replace("T", " ")}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="AI 刷新"
            onClick={onRefresh}
            disabled={refreshDisabled}
            data-testid={`refresh-${r.id}`}
          >
            <RefreshIcon className={refreshing ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Link href={`/articles/${r.id}/edit`} data-testid={`edit-${r.id}`}>
            <Button variant="ghost" size="icon" aria-label="编辑">
              <PencilIcon className="size-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="复制这篇文章"
            title="创建这篇文章的副本"
            onClick={onDuplicate}
            disabled={duplicating || actionDisabled}
            data-testid={`duplicate-${r.id}`}
          >
            <CopyIcon className={duplicating ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="发送到公众号草稿箱"
            title="自动上传图片并创建公众号草稿，到公众号后台手动发表"
            onClick={onSendWechat}
            disabled={sendingWechat || actionDisabled}
            data-testid={`send-wechat-${r.id}`}
          >
            <MessageCircleIcon className={sendingWechat ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="移入回收站"
            onClick={onDelete}
            disabled={actionDisabled}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function ArticlesTable({
  rows,
  configMap,
  siteUrlMap,
  selectedIds,
  refreshingId,
  duplicatingId,
  sendingWechatId,
  disabledIds,
  onToggleRow,
  onToggleAll,
  onRefresh,
  onDuplicate,
  onSendWechat,
  onDelete,
  sortOrder,
  onToggleSort,
}: ArticleTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30 text-left">
          <tr>
            <th className="w-10 px-4 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="全选当前列表文章"
                data-testid="select-all"
                className="size-4"
              />
            </th>
            <th className="px-4 py-2 font-medium">标题</th>
            <th className="px-4 py-2 font-medium">文章归属</th>
            <th className="px-4 py-2 font-medium">已发到</th>
            <th className="px-4 py-2 font-medium">状态</th>
            <th className="px-4 py-2 font-medium">同步</th>
            <th className="px-4 py-2 font-medium">
              <button
                type="button"
                onClick={onToggleSort}
                className="inline-flex items-center gap-1 hover:text-foreground"
                data-testid="sort-updated-at"
              >
                更新时间
                <SortIcon order={sortOrder} />
              </button>
            </th>
            <th className="w-40 px-4 py-2 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const siteName = r.siteConfigId ? (configMap[r.siteConfigId] ?? null) : null;
            const siteUrl = r.siteConfigId ? (siteUrlMap[r.siteConfigId] ?? null) : null;
            const siteHref =
              r.siteConfigId && (r.wpUrl || (siteUrl && r.wpPostId))
                ? (r.wpUrl ?? `${siteUrl}/?p=${r.wpPostId}`)
                : null;
            const publishTargets = (r.publishes ?? []).map((p) => ({
              name: configMap[p.configId] ?? p.configId,
              href:
                p.wpUrl ??
                (siteUrlMap[p.configId] ? `${siteUrlMap[p.configId]}/?p=${p.wpPostId}` : null),
            }));
            return (
              <ArticleTableRow
                key={r.id}
                r={r}
                siteName={siteName}
                siteHref={siteHref}
                publishTargets={publishTargets}
                selected={selectedIds.has(r.id)}
                refreshing={refreshingId === r.id}
                duplicating={duplicatingId === r.id}
                sendingWechat={sendingWechatId === r.id}
                refreshDisabled={refreshingId === r.id || disabledIds.has(r.id)}
                actionDisabled={disabledIds.has(r.id)}
                onToggle={() => onToggleRow(r.id)}
                onRefresh={() => onRefresh(r.id)}
                onDuplicate={() => onDuplicate(r.id)}
                onSendWechat={() => onSendWechat(r.id)}
                onDelete={() => onDelete(r.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
