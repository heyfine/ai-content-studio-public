"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu as CpuIcon } from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";

interface RouteRow {
  id: string;
  task: string;
  modelId: string;
}
interface ProviderModel {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
}
interface ProviderRow {
  id: string;
  name: string;
  enabled: boolean;
  models: ProviderModel[];
}

/** 单下拉：列出所有可用模型，按供应商分组；选中即更新当前任务的路由 */
export function StudioModelSelector() {
  const selectedTask = useStudioStore((s) => s.selectedTask);
  const setSelectedTask = useStudioStore((s) => s.setSelectedTask);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [routeRes, provRes] = await Promise.all([
        fetch("/api/task-routes"),
        fetch("/api/providers"),
      ]);
      if (!routeRes.ok || !provRes.ok) throw new Error("加载模型失败");
      const rdata = (await routeRes.json()) as { routes: RouteRow[] };
      const pdata = (await provRes.json()) as ProviderRow[];
      const map: Record<string, string> = {};
      for (const r of rdata.routes) map[r.task] = r.modelId;
      setRoutes(map);
      setProviders(pdata);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enabledProviders = providers.filter((p) => p.enabled);

  async function selectModel(modelId: string) {
    const task = selectedTask;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/task-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, modelId }),
      });
      if (!res.ok) throw new Error("切换模型失败");
      setRoutes((prev) => ({ ...prev, [task]: modelId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const currentModelId = routes[selectedTask] ?? "";
  const current = enabledProviders
    .flatMap((p) => p.models.map((m) => ({ provider: p, model: m })))
    .find((x) => x.model.id === currentModelId);

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2"
      data-testid="studio-model-selector"
    >
      <CpuIcon className="size-4 text-muted-foreground" />
      <select
        aria-label="选择任务"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        value={selectedTask}
        onChange={(e) => setSelectedTask(e.target.value)}
        disabled={saving}
      >
        <option value="article_generate">文章生成</option>
        <option value="outline_generate">大纲生成</option>
        <option value="title_generate">标题生成</option>
        <option value="summary">摘要生成</option>
        <option value="translate">翻译</option>
        <option value="seo_analyze">SEO 分析</option>
        <option value="seo_optimize">SEO 优化</option>
        <option value="review">AI 审核</option>
      </select>
      <span className="text-muted-foreground">·</span>
      <select
        aria-label="选择模型"
        className="h-8 max-w-[260px] rounded-md border border-input bg-transparent px-2 text-sm"
        value={currentModelId}
        onChange={(e) => void selectModel(e.target.value)}
        disabled={loading || saving || enabledProviders.length === 0}
        data-testid="model-select"
      >
        <option value="">{loading ? "加载中…" : "选择模型"}</option>
        {enabledProviders.map((p) => (
          <optgroup key={p.id} label={p.name}>
            {p.models
              .filter((m) => m.enabled)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {saving && <span className="text-xs text-muted-foreground">切换中…</span>}
      {!saving && current && (
        <span className="text-xs text-muted-foreground" data-testid="current-model">
          当前：{current.provider.name} · {current.model.displayName}
        </span>
      )}
      {!saving && !current && enabledProviders.length > 0 && currentModelId === "" && (
        <span className="text-xs text-amber-600">未配置模型，请选择</span>
      )}
      {enabledProviders.length === 0 && !loading && (
        <span className="text-xs text-amber-600">暂无可用模型，请先在「AI 模型」添加</span>
      )}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
