"use client";

import {
  ChevronDown as ChevronDownIcon,
  ChevronsUpDown as ChevronsUpDownIcon,
  ChevronUp as ChevronUpIcon,
  ExternalLink as ExternalLinkIcon,
  Pencil as PencilIcon,
  RefreshCw as RefreshIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isStaleArticle } from "@/lib/article-staleness";
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
  disabledIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onRefresh: (id: string) => void;
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
  selected,
  refreshing,
  refreshDisabled,
  actionDisabled,
  onToggle,
  onRefresh,
  onDelete,
}: {
  r: ArticleRow;
  siteName: string | null;
  siteHref: string | null;
  selected: boolean;
  refreshing: boolean;
  refreshDisabled: boolean;
  actionDisabled: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const stale = isStaleArticle({
    updatedAt: r.updatedAt ?? new Date(0),
    seoScore: r.seoScore,
  });
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
        <ArticleStatusBadge status={r.status} />
      </td>
      <td className="px-4 py-2">
        <SyncBadge status={r.syncStatus} lastSyncedAt={r.lastSyncedAt} />
      </td>
      <td className="px-4 py-2">
        {stale && (
          <span
            className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400"
            data-testid={`stale-mark-${r.id}`}
          >
            待刷新
          </span>
        )}
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
  disabledIds,
  onToggleRow,
  onToggleAll,
  onRefresh,
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
            <th className="px-4 py-2 font-medium">状态</th>
            <th className="px-4 py-2 font-medium">同步</th>
            <th className="px-4 py-2 font-medium">标记</th>
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
            return (
              <ArticleTableRow
                key={r.id}
                r={r}
                siteName={siteName}
                siteHref={siteHref}
                selected={selectedIds.has(r.id)}
                refreshing={refreshingId === r.id}
                refreshDisabled={refreshingId === r.id || disabledIds.has(r.id)}
                actionDisabled={disabledIds.has(r.id)}
                onToggle={() => onToggleRow(r.id)}
                onRefresh={() => onRefresh(r.id)}
                onDelete={() => onDelete(r.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
