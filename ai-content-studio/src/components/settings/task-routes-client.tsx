"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { taskRouteDefinitions } from "@/config/task-routes";

interface RouteRow {
  id: string;
  task: string;
  modelId: string;
}
interface RouteableModel {
  id: string;
  label: string;
}

export function TaskRoutesClient() {
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [models, setModels] = useState<RouteableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/task-routes");
      if (!res.ok) throw new Error("加载失败");
      const data = (await res.json()) as { routes: RouteRow[]; models: RouteableModel[] };
      const map: Record<string, string> = {};
      for (const r of data.routes) map[r.task] = r.modelId;
      setRoutes(map);
      setModels(data.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSave(task: string) {
    const modelId = routes[task];
    if (!modelId) return;
    setSaving(task);
    try {
      const res = await fetch("/api/task-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, modelId }),
      });
      if (!res.ok) throw new Error("保存失败");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    );
  if (models.length === 0) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>暂无可用模型</CardTitle>
          <CardDescription>请先在「AI 模型」页添加供应商与已启用的模型。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {taskRouteDefinitions.map((def) => (
        <Card key={def.value}>
          <CardHeader>
            <CardTitle className="text-base">{def.label}</CardTitle>
            <CardDescription>
              {def.description} · {def.value}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Select
              value={routes[def.value] ?? ""}
              onValueChange={(v) => v && setRoutes((prev) => ({ ...prev, [def.value]: v }))}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!routes[def.value] || saving === def.value}
              onClick={() => onSave(def.value)}
            >
              {saving === def.value ? "保存中…" : "保存"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
