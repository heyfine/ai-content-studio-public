import { StudioLayout } from "@/components/studio/studio-layout";
import { StudioModelSelector } from "@/components/studio/studio-model-selector";

export default function Page() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-1 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
        <p className="text-sm text-muted-foreground">
          AI 辅助创作工作台：左侧对话 / 中间原文与生成结果对比 / 右侧操作与模板。
        </p>
      </div>
      <div className="shrink-0 pb-2">
        <StudioModelSelector />
      </div>
      <div className="min-h-0 flex-1">
        <StudioLayout />
      </div>
    </div>
  );
}
