"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye as EyeIcon, EyeOff as EyeOffIcon, Copy as CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  createProviderSchema,
  type CreateProviderValues,
  type ModelItem,
} from "@/lib/schemas/provider";
import { ProviderModelsEditor } from "./provider-models-editor";

/** 编辑场景的 API Key 占位：type=password 下显示一串圆点表示"已存在但隐藏"；
 *  提交时若值仍是占位则不更新 Key。 */
const KEY_PLACEHOLDER = "UNCHANGED_KEY_PLACEHOLDER";

export interface ProviderFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: Partial<CreateProviderValues> & { id?: string };
  onSaved?: () => void;
}

function buildDefaults(iv: Partial<CreateProviderValues> & { id?: string }) {
  const isEdit = !!iv?.id;
  return {
    name: iv?.name ?? "",
    type: iv?.type ?? "OPENAI_COMPATIBLE",
    baseUrl: iv?.baseUrl ?? "",
    apiKey: isEdit ? KEY_PLACEHOLDER : "",
    enabled: iv?.enabled ?? true,
    models: (iv?.models as ModelItem[] | undefined) ?? [],
  };
}

export function ProviderFormDialog({ trigger, initialValues, onSaved }: ProviderFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const isEdit = !!initialValues?.id;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProviderValues>({
    resolver: zodResolver(createProviderSchema),
    defaultValues: buildDefaults(initialValues ?? {}),
  });

  // 每次打开对话框都重置为初始值：编辑时 Key 显示屏蔽占位，关闭重开仍显示占位
  useEffect(() => {
    if (open) {
      reset(buildDefaults(initialValues ?? {}));
      setShowKey(false);
      setSubmitError(null);
      setCopied(false);
    }
  }, [open, initialValues, reset]);

  const type = watch("type");
  const baseUrl = watch("baseUrl") ?? "";
  const apiKey = watch("apiKey") ?? "";
  const models = watch("models") ?? [];

  async function toggleReveal() {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (isEdit) {
      setRevealing(true);
      try {
        const res = await fetch(`/api/providers/${initialValues?.id}`);
        const data = (await res.json()) as { apiKey?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "获取失败");
        setValue("apiKey", data.apiKey ?? "", { shouldDirty: true });
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : String(e));
      } finally {
        setRevealing(false);
      }
    }
    setShowKey(true);
  }

  async function copyKey() {
    const v = watch("apiKey");
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 无剪贴板权限时静默
    }
  }

  async function onSubmit(values: CreateProviderValues) {
    setSubmitError(null);
    // 编辑且 Key 仍是占位 → 不传 apiKey（保持不变）
    const body: Record<string, unknown> = { ...values };
    if (isEdit && values.apiKey === KEY_PLACEHOLDER) {
      delete body.apiKey;
    }
    if (body.models === undefined) {
      delete body.models;
    }
    try {
      const res = await fetch(isEdit ? `/api/providers/${initialValues?.id}` : "/api/providers", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(err.error ?? "操作失败");
        return;
      }
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as never} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑供应商" : "添加供应商"}</DialogTitle>
          <DialogDescription>配置 AI 供应商连接信息，API Key 将被加密存储。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">名称</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p role="alert" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>类型</Label>
            <Select
              value={type}
              onValueChange={(v) => setValue("type", v as CreateProviderValues["type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPENAI">OpenAI 官方</SelectItem>
                <SelectItem value="OPENAI_COMPATIBLE">OpenAI 兼容</SelectItem>
                <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                <SelectItem value="GEMINI">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type === "OPENAI_COMPATIBLE" || type === "OPENAI") && (
            <div className="space-y-2">
              <Label htmlFor="baseUrl">
                Base URL{type === "OPENAI_COMPATIBLE" ? "（必填）" : "（官方默认可留空）"}
              </Label>
              <Input id="baseUrl" placeholder="https://api.deepseek.com" {...register("baseUrl")} />
              {errors.baseUrl && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.baseUrl.message}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key{isEdit ? "（点眼睛查看）" : ""}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                {...register("apiKey")}
                data-testid="api-key-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void toggleReveal()}
                disabled={revealing}
                aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                aria-pressed={showKey}
                data-testid="toggle-reveal"
              >
                {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void copyKey()}
                disabled={!apiKey}
                aria-label="复制 API Key"
                data-testid="copy-key"
              >
                <CopyIcon className="size-4" />
              </Button>
              {copied && (
                <span className="text-xs text-emerald-600" data-testid="copied-tip">
                  已复制
                </span>
              )}
            </div>
            {errors.apiKey && (
              <p role="alert" className="text-sm text-destructive">
                {errors.apiKey.message}
              </p>
            )}
          </div>
          <ProviderModelsEditor
            models={models}
            onChange={(next) => setValue("models", next, { shouldDirty: true })}
            providerConfig={{ type, baseUrl, apiKey }}
            providerId={initialValues?.id}
          />
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="ghost">
                  取消
                </Button>
              }
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
