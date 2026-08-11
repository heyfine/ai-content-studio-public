"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  type CreateProviderInputValues,
  type ModelItem,
} from "@/lib/schemas/provider";
import { ProviderModelsEditor } from "./provider-models-editor";

export interface ProviderFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: Partial<CreateProviderValues> & { id?: string };
  onSaved?: () => void;
}

export function ProviderFormDialog({ trigger, initialValues, onSaved }: ProviderFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEdit = !!initialValues?.id;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProviderInputValues, unknown, CreateProviderValues>({
    resolver: zodResolver(createProviderSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      type: initialValues?.type ?? "OPENAI_COMPATIBLE",
      baseUrl: initialValues?.baseUrl ?? "",
      apiKey: "",
      enabled: initialValues?.enabled ?? true,
      models: (initialValues?.models as ModelItem[] | undefined) ?? [],
    },
  });

  const type = watch("type");
  const baseUrl = watch("baseUrl") ?? "";
  const apiKey = watch("apiKey") ?? "";
  const models = watch("models") ?? [];

  async function onSubmit(values: CreateProviderValues) {
    setSubmitError(null);
    try {
      const res = await fetch(isEdit ? `/api/providers/${initialValues?.id}` : "/api/providers", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(err.error ?? "操作失败");
        return;
      }
      setOpen(false);
      reset();
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
            <Label htmlFor="apiKey">API Key{isEdit ? "（留空表示不变）" : ""}</Label>
            <Input id="apiKey" type="password" {...register("apiKey")} />
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
