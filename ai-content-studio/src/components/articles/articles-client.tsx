"use client";

import {
  Archive as ArchiveIcon,
  Download as DownloadIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  Server as ServerIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ARTICLE_STATUS_LIST, ARTICLE_STATUS_LABELS } from "@/lib/article-status";
import type { ArticleRow } from "@/lib/article-types";
import { ArticlesTable } from "./articles-table";
import type { RefreshOutcome } from "./articles-table";

interface WordpressConfig {
  id: string;
  name: string;
  enabled: boolean;
}

type SyncFilter = "ALL" | "SYNCED" | "CONFLICT" | "FAILED" | "NONE";

const SYNC_FILTER_LABELS: Record<SyncFilter, string> = {
  ALL: "同步状态",
  SYNCED: "已同步",
  CONFLICT: "冲突",
  FAILED: "失败",
  NONE: "未同步",
};

/** 本地文章选项值（无 siteConfigId） */
const LOCAL_OPTION = "__local__";

export function ArticlesClient() {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome | null>(null);
  const [wordpressConfigs, setWordpressConfigs] = useState<WordpressConfig[]>([]);
  // 文章归属筛选（多选：博客站点 + 本地文章），只用于过滤文章列表
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  // 从博客同步的站点（单选，保留原下拉）
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    synced: number;
    conflicts: number;
    errors: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/articles");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as ArticleRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 加载 WordPress 站点配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const res = await fetch("/api/wordpress/configs");
        if (res.ok) {
          setWordpressConfigs(await res.json());
        }
      } catch (e) {
        console.error("加载 WordPress 站点失败:", e);
      }
    };
    void loadConfigs();
  }, []);

  const configMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of wordpressConfigs) map[c.id] = c.name;
    return map;
  }, [wordpressConfigs]);

  function toggleSite(option: string) {
    setSelectedSites((prev) =>
      prev.includes(option) ? prev.filter((s) => s !== option) : [...prev, option],
    );
  }

  async function onDelete(id: string) {
    if (!confirm("确认将文章移入回收站？")) return;
    setError(null);
    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wpSynced?: boolean;
        wpError?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "移入回收站失败");
      await refresh();
      if (data.wpSynced === false) {
        setError(`已移入本地回收站，但博客同步失败：${data.wpError ?? "未知错误"}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRefresh(id: string) {
    setRefreshingId(id);
    setRefreshOutcome(null);
    try {
      const res = await fetch(`/api/articles/${id}/refresh`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        articleId?: string;
        oldSeoScore?: number | null;
        newSeoScore?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "刷新失败");
      const oldScore = data.oldSeoScore ?? null;
      const newScore = data.newSeoScore ?? 0;
      setRefreshOutcome({
        articleId: id,
        oldSeoScore: oldScore,
        newSeoScore: newScore,
        delta: newScore - (oldScore ?? 0),
      });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? `AI 刷新失败：${e.message}` : String(e));
    } finally {
      setRefreshingId(null);
    }
  }

  async function onSyncFromBlog() {
    if (!selectedConfigId) {
      setError("请先选择博客站点");
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/wordpress/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: selectedConfigId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        synced?: number;
        conflicts?: number;
        errors?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "同步失败");
      setSyncResult({
        synced: data.synced ?? 0,
        conflicts: data.conflicts ?? 0,
        errors: data.errors ?? 0,
      });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  // 站点过滤：没选中任何站点 → 全部；选中 __local__ → 本地；选中具体站点 → 只显示这些站点
  const siteFiltered = useMemo(() => {
    if (selectedSites.length === 0) return rows;
    const localSelected = selectedSites.includes(LOCAL_OPTION);
    const configSelected = selectedSites.filter((s) => s !== LOCAL_OPTION);
    return rows.filter((r) => {
      if (r.siteConfigId && configSelected.includes(r.siteConfigId)) return true;
      if (!r.siteConfigId && localSelected) return true;
      return false;
    });
  }, [rows, selectedSites]);

  const filteredRows = useMemo(() => {
    let list = siteFiltered;
    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (syncFilter !== "ALL") {
      list = list.filter((r) => {
        if (syncFilter === "NONE") return !r.syncStatus;
        return r.syncStatus === syncFilter;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((r) => r.title.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const at = new Date(a.updatedAt ?? 0).getTime();
      const bt = new Date(b.updatedAt ?? 0).getTime();
      return sortOrder === "desc" ? bt - at : at - bt;
    });
  }, [siteFiltered, statusFilter, syncFilter, searchQuery, sortOrder]);

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-4" data-testid="articles-client">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">文章管理</h2>
        <div className="flex items-center gap-3">
          {/* 文章归属筛选：博客站点 + 本地文章（多选，过滤列表） */}
          {wordpressConfigs.length > 0 && (
            <Select
              value={selectedSites.length ? selectedSites[0] : ""}
              onValueChange={(value) => {
                if (value && !selectedSites.includes(value)) {
                  setSelectedSites([...selectedSites, value]);
                }
              }}
            >
              <SelectTrigger className="w-[200px]" aria-label="文章归属">
                <ServerIcon className="size-4 mr-2" />
                <SelectValue placeholder="文章归属">
                  {(value: string | null) => {
                    if (selectedSites.length > 1) {
                      return `已选 ${selectedSites.length} 项`;
                    }
                    if (!value) return "文章归属";
                    if (value === LOCAL_OPTION) return "本地文章";
                    return configMap[value] ?? value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {wordpressConfigs.map((config) => (
                  <div
                    key={config.id}
                    role="option"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                    onClick={() => toggleSite(config.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSites.includes(config.id)}
                      readOnly
                      className="size-4"
                    />
                    <span>{config.name}</span>
                  </div>
                ))}
                <div
                  role="option"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                  onClick={() => toggleSite(LOCAL_OPTION)}
                >
                  <input
                    type="checkbox"
                    checked={selectedSites.includes(LOCAL_OPTION)}
                    readOnly
                    className="size-4"
                  />
                  <span>本地文章</span>
                </div>
              </SelectContent>
            </Select>
          )}
          {/* 从博客同步：保留原站点下拉（单选）+ 同步按钮 */}
          {wordpressConfigs.length > 0 && (
            <Select
              value={selectedConfigId}
              onValueChange={(value) => setSelectedConfigId(value || "")}
            >
              <SelectTrigger className="w-[180px]" aria-label="选择博客站点">
                <ServerIcon className="size-4 mr-2" />
                <SelectValue placeholder="选择博客站点">
                  {(value: string | null) =>
                    value ? (configMap[value] ?? value) : "选择博客站点"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {wordpressConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            onClick={onSyncFromBlog}
            disabled={!selectedConfigId || syncing}
            data-testid="sync-from-blog"
          >
            <DownloadIcon className="size-4 mr-1" />
            {syncing ? "同步中…" : "从博客同步"}
          </Button>
          <Link href="/articles/trash" data-testid="trash-link">
            <Button variant="outline" size="sm">
              <ArchiveIcon className="size-4" /> 回收站
            </Button>
          </Link>
          <Link href="/articles/new" data-testid="new-article-link">
            <Button size="sm">
              <PlusIcon className="size-4" /> 新建文章
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* 搜索 */}
        <div className="relative">
          <SearchIcon className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="w-[220px] pl-8"
            placeholder="搜索文章…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="search-input"
          />
        </div>
        {/* 状态筛选 */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "ALL")}
        >
          <SelectTrigger className="w-[140px]" aria-label="状态筛选">
            <SelectValue placeholder="状态筛选">
              {(value: string | null) =>
                !value || value === "ALL"
                  ? "全部状态"
                  : (ARTICLE_STATUS_LABELS[value] ?? value)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            {ARTICLE_STATUS_LIST.map((s) => (
              <SelectItem key={s} value={s}>
                {ARTICLE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* 同步标记筛选 */}
        <Select
          value={syncFilter}
          onValueChange={(v) => setSyncFilter(v as SyncFilter)}
        >
          <SelectTrigger className="w-[140px]" aria-label="同步标记">
            <SelectValue placeholder="同步状态">
              {(value: string | null) =>
                !value || value === "ALL"
                  ? "同步状态"
                  : SYNC_FILTER_LABELS[value as SyncFilter] ?? value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SYNC_FILTER_LABELS) as SyncFilter[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SYNC_FILTER_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">共 {filteredRows.length} 篇</p>
      </div>

      {syncResult && (
        <p className="text-sm">
          同步完成：成功 {syncResult.synced} 篇，
          {syncResult.conflicts > 0 && (
            <span className="ml-1 text-amber-600">
              冲突 {syncResult.conflicts} 篇（点击文章查看详情）
            </span>
          )}
          {syncResult.errors > 0 && (
            <span className="ml-1 text-destructive">失败 {syncResult.errors} 篇</span>
          )}
        </p>
      )}

      {refreshOutcome && (
        <p className="text-sm text-emerald-600" data-testid="refresh-outcome">
          AI 刷新完成：SEO 评分 {refreshOutcome.oldSeoScore ?? "—"} →{" "}
          <span className="font-medium">{refreshOutcome.newSeoScore}</span>
          {refreshOutcome.delta > 0 && <span className="ml-1">（+{refreshOutcome.delta}）</span>}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无文章。</p>
      ) : (
        <ArticlesTable
          rows={filteredRows}
          configMap={configMap}
          refreshingId={refreshingId}
          disabledIds={new Set()}
          onRefresh={onRefresh}
          onDelete={onDelete}
          sortOrder={sortOrder}
          onToggleSort={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
        />
      )}
    </div>
  );
}