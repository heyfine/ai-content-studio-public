"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu as CpuIcon } from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";
import { cn } from "@/lib/utils";
import { taskRouteDefinitions } from "@/config/task-routes";

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

/** 模型 → 供应商 反查表 */
function buildModelProviderMap(providers: ProviderRow[]) {
  const map = new Map<string, ProviderRow>();
  for (const p of providers) {
    for (const m of p.models) map.set(m.id, p);
  }
  return map;
}

export function StudioModelSelector() {
  const selectedTask = useStudioStore((s) => s.selectedTask);
  const setSelectedTask = useStudioStore((s) => s.setSelectedTask);
  const reasoningEnabled = useStudioStore((s) => s.reasoningEnabled);
  const setReasoningEnabled = useStudioStore((s) => s.setReasoningEnabled);
  const reasoningEffort = useStudioStore((s) => s.reasoningEffort);
  const setReasoningEffort = useStudioStore((s) => s.setReasoningEffort);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAll = selectedTask === "all";

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

  const modelProviderMap = useMemo(() => buildModelProviderMap(providers), [providers]);
  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers]);

  // 切换任务时自动定位到当前模型所属供应商
  useEffect(() => {
    if (isAll) {
      setSelectedProviderId("");
      return;
    }
    const mid = routes[selectedTask];
    const mp = mid ? modelProviderMap.get(mid) : undefined;
    setSelectedProviderId(mp?.id ?? "");
  }, [selectedTask, routes, modelProviderMap, isAll]);

  const currentModelId = isAll ? "" : (routes[selectedTask] ?? "");
  const availableModels = useMemo(() => {
    const p = enabledProviders.find((x) => x.id === selectedProviderId);
    return (p?.models ?? []).filter((m) => m.enabled);
  }, [enabledProviders, selectedProviderId]);

  async function saveRoute(task: string, modelId: string) {
    const res = await fetch("/api/task-routes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, modelId }),
    });
    if (!res.ok) throw new Error("切换模型失败");
  }

  async function selectModel(modelId: string) {
    if (!modelId || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (isAll) {
        // 批量给所有任务配同一模型
        await Promise.all(taskRouteDefinitions.map((d) => saveRoute(d.value, modelId)));
        const upd: Record<string, string> = {};
        for (const d of taskRouteDefinitions) upd[d.value] = modelId;
        setRoutes(upd);
      } else {
        await saveRoute(selectedTask, modelId);
        setRoutes((prev) => ({ ...prev, [selectedTask]: modelId }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const current = currentModelId ? modelProviderMap.get(currentModelId) : undefined;
  const currentModel = current?.models.find((m) => m.id === currentModelId);

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
        <option value="all">全选（批量）</option>
        {taskRouteDefinitions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">·</span>
      <select
        aria-label="选择供应商"
        className="h-8 max-w-[180px] rounded-md border border-input bg-transparent px-2 text-sm"
        value={selectedProviderId}
        onChange={(e) => setSelectedProviderId(e.target.value)}
        disabled={loading || saving || enabledProviders.length === 0}
        data-testid="provider-select"
      >
        <option value="">{loading ? "加载中…" : "选择供应商"}</option>
        {enabledProviders.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        aria-label="选择模型"
        className="h-8 max-w-[220px] rounded-md border border-input bg-transparent px-2 text-sm"
        value={availableModels.some((m) => m.id === currentModelId) ? currentModelId : ""}
        onChange={(e) => void selectModel(e.target.value)}
        disabled={loading || saving || !selectedProviderId || availableModels.length === 0}
        data-testid="model-select"
      >
        <option value="">{!selectedProviderId ? "先选供应商" : "选择模型"}</option>
        {availableModels.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">·</span>
      <button
        type="button"
        role="switch"
        aria-checked={reasoningEnabled}
        aria-label={reasoningEnabled ? "关闭深度思考" : "开启深度思考"}
        data-testid="reasoning-toggle"
        disabled={saving}
        onClick={() => setReasoningEnabled(!reasoningEnabled)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          reasoningEnabled ? "bg-emerald-500" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
            reasoningEnabled ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="text-xs text-muted-foreground">深度思考</span>
      {reasoningEnabled && (
        <select
          aria-label="推理强度"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={reasoningEffort}
          onChange={(e) => setReasoningEffort(e.target.value as "low" | "medium" | "high")}
          disabled={saving}
          data-testid="reasoning-effort"
        >
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      )}
      {saving && <span className="text-xs text-muted-foreground">切换中…</span>}
      {!saving && isAll && (
        <span className="text-xs text-muted-foreground" data-testid="all-hint">
          全选模式：所选模型将应用到全部任务
        </span>
      )}
      {!saving && !isAll && current && currentModel && (
        <span className="text-xs text-muted-foreground" data-testid="current-model">
          当前：{current.name} · {currentModel.displayName}
        </span>
      )}
      {!saving && !isAll && !current && enabledProviders.length > 0 && currentModelId === "" && (
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
