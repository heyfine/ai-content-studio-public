"use client";

import { useState } from "react";
import {
  Check as CheckIcon,
  Download as DownloadIcon,
  Plus as PlusIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ModelItem } from "@/lib/schemas/provider";

export interface ProviderModelsEditorProps {
  models: ModelItem[];
  onChange: (models: ModelItem[]) => void;
  /** 当前表单中的供应商配置（用于现场拉取模型列表） */
  providerConfig: { type: string; baseUrl: string; apiKey: string };
}

export function ProviderModelsEditor({
  models,
  onChange,
  providerConfig,
}: ProviderModelsEditorProps) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const canFetch = providerConfig.apiKey.trim().length > 0 && providerConfig.type !== "GEMINI";

  function addManual() {
    const n = name.trim();
    if (!n) return;
    if (models.some((m) => m.name === n)) {
      setError(`模型 ${n} 已存在`);
      return;
    }
    onChange([...models, { name: n, displayName: displayName.trim() || undefined }]);
    setName("");
    setDisplayName("");
    setError(null);
  }

  function removeAt(idx: number) {
    onChange(models.filter((_, i) => i !== idx));
  }

  async function fetchList() {
    setFetching(true);
    setError(null);
    setFetchedModels(null);
    setSelected(new Set());
    try {
      const res = await fetch("/api/providers/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: providerConfig.type,
          baseUrl: providerConfig.baseUrl || undefined,
          apiKey: providerConfig.apiKey,
        }),
      });
      const data = (await res.json()) as { models?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "获取失败");
      const list = data.models ?? [];
      setFetchedModels(list);
      setSelected(new Set(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  function toggleSelected(m: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function addSelected() {
    const existing = new Set(models.map((m) => m.name));
    const toAdd: ModelItem[] = [];
    for (const m of selected) {
      if (!existing.has(m)) toAdd.push({ name: m, displayName: undefined });
    }
    if (toAdd.length > 0) onChange([...models, ...toAdd]);
    setFetchedModels(null);
    setSelected(new Set());
  }

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="provider-models-editor">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">模型</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchList()}
          disabled={fetching || !canFetch}
          data-testid="fetch-models"
        >
          <DownloadIcon className="size-3.5" />
          {fetching ? "获取中…" : "获取模型"}
        </Button>
      </div>
      {!canFetch && (
        <p className="text-xs text-muted-foreground">
          {providerConfig.type === "GEMINI"
            ? "Gemini 适配器尚未接入，无法获取"
            : "请先填写 API Key 再获取"}
        </p>
      )}

      <ul className="space-y-1">
        {models.map((m, idx) => (
          <li
            key={`${m.name}-${idx}`}
            className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1"
          >
            <span className="text-sm">
              <span className="font-medium">{m.name}</span>
              {m.displayName && m.displayName !== m.name && (
                <span className="text-muted-foreground">（{m.displayName}）</span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`删除 ${m.name}`}
              onClick={() => removeAt(idx)}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </li>
        ))}
        {models.length === 0 && (
          <li className="text-xs text-muted-foreground">暂无模型，可手动添加或从供应商拉取。</li>
        )}
      </ul>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="model-name" className="text-xs">
            模型名
          </Label>
          <Input
            id="model-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="deepseek-chat"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="model-display" className="text-xs">
            显示名（可选）
          </Label>
          <Input
            id="model-display"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addManual}
          disabled={!name.trim()}
          data-testid="add-model"
        >
          <PlusIcon className="size-3.5" /> 添加
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {fetchedModels && (
        <div className="space-y-2 rounded-md border p-2" data-testid="fetched-list">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {fetchedModels.length} 个模型，勾选后加入
            </span>
            <Button
              type="button"
              size="sm"
              onClick={addSelected}
              disabled={selected.size === 0}
              data-testid="add-selected"
            >
              <CheckIcon className="size-3.5" /> 加入选中（{selected.size}）
            </Button>
          </div>
          <div className="max-h-48 space-y-1 overflow-auto">
            {fetchedModels.length === 0 && (
              <p className="text-xs text-muted-foreground">供应商未返回任何模型。</p>
            )}
            {fetchedModels.map((m) => (
              <label
                key={m}
                className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m)}
                  onChange={() => toggleSelected(m)}
                />
                <span>{m}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
