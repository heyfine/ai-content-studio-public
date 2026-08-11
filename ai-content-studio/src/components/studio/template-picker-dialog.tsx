"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PromptOption {
  id: string;
  name: string;
  type: string;
}

interface Props {
  open: boolean;
  /** 当前待确认的任务；null 表示对话框关闭 */
  task: string | null;
  taskLabel: string;
  templates: PromptOption[];
  /** 该任务上次确认的模板 id；null = 上次选择不使用模板 */
  remembered: string | null;
  onConfirm: (promptId: string | null) => void;
  onCancel: () => void;
}

/**
 * 点击「AI 操作」后弹出的 Prompt 模板选择对话框。
 * 只列出与任务类型匹配的模板；自动预选上次为该任务确认的模板（有记忆状态）。
 */
export function TemplatePickerDialog({
  open,
  task,
  taskLabel,
  templates,
  remembered,
  onConfirm,
  onCancel,
}: Props) {
  const filtered = useMemo(() => templates.filter((t) => t.type === task), [templates, task]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    // 记忆的模板仍存在则预选；已被删除或从未选择则回退到「不使用模板」
    const stillExists = filtered.some((t) => t.id === remembered);
    setSelected(stillExists ? (remembered ?? "") : "");
  }, [open, task, remembered, filtered]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择 Prompt 模板</DialogTitle>
          <DialogDescription>为「{taskLabel}」选择本次使用的提示词模板。</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1" data-testid="template-options">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">
              该任务类型暂无 Prompt 模板，将以不使用模板的方式生成。
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted/40">
            <input
              type="radio"
              name="prompt-template"
              className="size-4"
              checked={selected === ""}
              onChange={() => setSelected("")}
            />
            不使用模板
          </label>
          {filtered.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted/40"
            >
              <input
                type="radio"
                name="prompt-template"
                className="size-4"
                checked={selected === t.id}
                onChange={() => setSelected(t.id)}
              />
              {t.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={() => onConfirm(selected || null)}>开始生成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
