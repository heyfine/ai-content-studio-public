"use client";

import { useEffect, useState } from "react";
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestJson } from "./client-api";
import { FetchedModelsPanel } from "./fetched-models-panel";
import {
  BASE_URL_HINTS,
  parseModelsText,
  type ModelTestState,
  type ProviderFormTarget,
  type ProviderType,
} from "./provider-types";

const TYPE_OPTIONS: Array<{ value: ProviderType; label: string }> = [
  { value: "OPENAI", label: "OpenAI 官方" },
  { value: "OPENAI_COMPATIBLE", label: "OpenAI 兼容" },
  { value: "ANTHROPIC", label: "Anthropic (Claude)" },
  { value: "GEMINI", label: "Google Gemini" },
];

export interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = 新建 */
  target: ProviderFormTarget | null;
  /** 复制渠道场景带入的已存 Key 明文 */
  initialApiKey?: string;
  onSaved?: () => void;
}

/** 渠道式供应商表单浮窗：Key 留空不修改（眼睛查看）、获取模型勾选、逐模型/全部连通测试 */
export function ProviderFormDialog({
  open,
  onOpenChange,
  target,
  initialApiKey,
  onSaved,
}: ProviderFormDialogProps) {
  const isEdit = !!target?.id;
  const [name, setName] = useState("");
  const [type, setType] = useState<ProviderType>("OPENAI_COMPATIBLE");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelsText, setModelsText] = useState("");
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [checkedModels, setCheckedModels] = useState<Set<string>>(new Set());
  const [modelTests, setModelTests] = useState<Record<string, ModelTestState>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 每次打开时从目标初始化；关闭时重置临时状态
  useEffect(() => {
    if (!open) return;
    setName(target?.name ?? "");
    setType(target?.type ?? "OPENAI_COMPATIBLE");
    setBaseUrl(target?.baseUrl ?? "");
    setApiKey(initialApiKey ?? "");
    setShowKey(false);
    setModelsText((target?.models ?? []).map((m) => m.name).join("\n"));
    setFetchingModels(false);
    setFetchedModels(null);
    setCheckedModels(new Set());
    setModelTests({});
    setTestingAll(false);
    setSaving(false);
    setError("");
  }, [open, target, initialApiKey]);

  function close() {
    onOpenChange(false);
  }

  /** 眼睛图标：编辑时首次点击取回已保存的 Key，之后切换明文/密文显示 */
  async function toggleKeyVisibility() {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (isEdit && !apiKey && target?.id) {
      try {
        const res = await requestJson<{ apiKey: string }>(`/api/providers/${target.id}`);
        setApiKey(res.apiKey);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setShowKey(true);
  }

  /** 从上游供应商拉取可用模型列表，弹出行内勾选面板 */
  async function fetchModels() {
    if (!baseUrl && type === "OPENAI_COMPATIBLE") {
      setError("请先填写 Base URL");
      return;
    }
    setFetchingModels(true);
    setError("");
    try {
      const res = await requestJson<{ models: string[] }>("/api/providers/fetch-models", {
        method: "POST",
        body: JSON.stringify({ type, baseUrl, apiKey, providerId: target?.id }),
      });
      if (res.models.length === 0) {
        setError("上游返回了空模型列表");
      } else {
        setFetchedModels(res.models);
        setCheckedModels(new Set());
        setModelTests({});
      }
    } catch (e) {
      setError(`获取模型失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFetchingModels(false);
    }
  }

  /** 对面板中的单个模型做连通性测试 */
  async function testOneModel(model: string) {
    setModelTests((prev) => ({ ...prev, [model]: { status: "running" } }));
    try {
      const res = await requestJson<{ ok: boolean; latencyMs: number; error?: string }>(
        "/api/providers/test-model",
        {
          method: "POST",
          body: JSON.stringify({ type, baseUrl, apiKey, providerId: target?.id, model }),
        },
      );
      setModelTests((prev) => ({
        ...prev,
        [model]: res.ok
          ? { status: "ok", latencyMs: res.latencyMs }
          : { status: "fail", error: res.error ?? "测试失败" },
      }));
    } catch (e) {
      setModelTests((prev) => ({
        ...prev,
        [model]: { status: "fail", error: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  /** 全部测试：并发 5 个一组，逐组完成 */
  async function testAllModels() {
    if (!fetchedModels) return;
    setTestingAll(true);
    setModelTests(
      Object.fromEntries(fetchedModels.map((m) => [m, { status: "running" as const }])),
    );
    const chunkSize = 5;
    for (let i = 0; i < fetchedModels.length; i += chunkSize) {
      await Promise.all(fetchedModels.slice(i, i + chunkSize).map((m) => testOneModel(m)));
    }
    setTestingAll(false);
  }

  /** 把勾选的模型并入文本框并关闭面板 */
  function confirmFetchedModels() {
    const picked = (fetchedModels ?? []).filter((m) => checkedModels.has(m));
    setModelsText([...new Set([...parseModelsText(modelsText), ...picked])].join("\n"));
    setFetchedModels(null);
    setCheckedModels(new Set());
    setModelTests({});
  }

  async function save() {
    const models = parseModelsText(modelsText);
    if (!name.trim()) {
      setError("请输入名称");
      return;
    }
    if (models.length === 0) {
      setError("至少填写一个支持的模型");
      return;
    }
    if (type === "OPENAI_COMPATIBLE" && !baseUrl.trim()) {
      setError("OpenAI 兼容接口必须填写 Base URL");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        type,
        baseUrl,
        // 编辑时留空表示不修改
        apiKey: apiKey || undefined,
        enabled: target?.enabled ?? true,
        models: models.map((m) => ({ name: m })),
      };
      if (isEdit && target?.id) {
        await requestJson(`/api/providers/${target.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await requestJson("/api/providers", { method: "POST", body: JSON.stringify(body) });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑供应商" : "新建供应商"}</DialogTitle>
          <DialogDescription>配置 AI 供应商连接信息，API Key 将被加密存储。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="provider-name">名称</Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如 DeepSeek 官方"
            />
          </div>
          <div className="space-y-2">
            <Label>类型</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as ProviderType)}>
              <SelectTrigger data-testid="type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-base-url">Base URL（填到域名即可）</Label>
            <Input
              id="provider-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={BASE_URL_HINTS[type]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-api-key">API Key{isEdit ? "（留空表示不修改）" : ""}</Label>
            <div className="relative">
              <Input
                id="provider-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit && !apiKey ? "已保存（点眼睛图标查看）" : ""}
                data-testid="api-key-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                onClick={() => void toggleKeyVisibility()}
                aria-label={showKey ? "隐藏 API Key" : "查看 API Key"}
                data-testid="toggle-reveal"
              >
                {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="provider-models">支持的模型（每行一个）</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fetchingModels}
                onClick={() => void fetchModels()}
                data-testid="fetch-models"
              >
                {fetchingModels ? "获取中..." : "获取模型"}
              </Button>
            </div>
            <textarea
              id="provider-models"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              placeholder={"deepseek-chat\ndeepseek-reasoner"}
              data-testid="models-textarea"
            />
            {fetchedModels && (
              <FetchedModelsPanel
                models={fetchedModels}
                checked={checkedModels}
                tests={modelTests}
                testingAll={testingAll}
                onToggle={(m) =>
                  setCheckedModels((prev) => {
                    const next = new Set(prev);
                    if (next.has(m)) next.delete(m);
                    else next.add(m);
                    return next;
                  })
                }
                onToggleAll={(checked) =>
                  setCheckedModels(checked ? new Set(fetchedModels) : new Set())
                }
                onTestOne={(m) => void testOneModel(m)}
                onTestAll={() => void testAllModels()}
                onCancel={() => {
                  setFetchedModels(null);
                  setModelTests({});
                }}
                onConfirm={confirmFetchedModels}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              data-testid="save-provider"
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
