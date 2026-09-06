"use client";

import type { ModelTestState } from "./provider-types";

export interface FetchedModelsPanelProps {
  models: string[];
  checked: Set<string>;
  tests: Record<string, ModelTestState>;
  testingAll: boolean;
  onToggle: (model: string) => void;
  onToggleAll: (checked: boolean) => void;
  onTestOne: (model: string) => void;
  onTestAll: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 获取模型后的勾选面板：全选/逐个测试/全部测试，确定后并入模型文本框 */
export function FetchedModelsPanel({
  models,
  checked,
  tests,
  testingAll,
  onToggle,
  onToggleAll,
  onTestOne,
  onTestAll,
  onCancel,
  onConfirm,
}: FetchedModelsPanelProps) {
  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50" data-testid="fetched-models-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-blue-100">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-blue-600"
            aria-label="全选模型"
            checked={models.length > 0 && checked.size === models.length}
            onChange={(e) => onToggleAll(e.target.checked)}
          />
          <span className="font-medium">全选</span>
          <span className="text-xs text-muted-foreground">
            已选 {checked.size} / {models.length}
          </span>
        </label>
        <div className="space-x-2">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            disabled={testingAll}
            onClick={onTestAll}
          >
            {testingAll ? "测试中..." : "全部测试"}
          </button>
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={checked.size === 0}
            onClick={onConfirm}
          >
            确定
          </button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto px-3 py-2">
        {models.map((m) => {
          const t = tests[m];
          return (
            <div
              key={m}
              className="flex items-center justify-between gap-2 rounded hover:bg-blue-50 px-1 py-0.5"
            >
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none min-w-0">
                <input
                  type="checkbox"
                  className="accent-blue-600 shrink-0"
                  aria-label={`选择模型 ${m}`}
                  checked={checked.has(m)}
                  onChange={() => onToggle(m)}
                />
                <span className="font-mono text-xs truncate" title={m}>
                  {m}
                </span>
              </label>
              <div className="flex items-center gap-2 shrink-0">
                {t?.status === "ok" && (
                  <span
                    className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700"
                    title={`${t.latencyMs}ms`}
                  >
                    ✓ {t.latencyMs}ms
                  </span>
                )}
                {t?.status === "fail" && (
                  <span
                    className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 max-w-[180px] truncate"
                    title={t.error}
                  >
                    ✗ {t.error}
                  </span>
                )}
                {t?.status === "running" && (
                  <span className="text-xs text-muted-foreground">测试中...</span>
                )}
                <button
                  type="button"
                  className="rounded-md border px-1.5 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
                  aria-label={`测试模型 ${m}`}
                  disabled={t?.status === "running" || testingAll}
                  onClick={() => onTestOne(m)}
                >
                  测试
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
