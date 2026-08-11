import { StudioLayout } from "@/components/studio/studio-layout";
import { StudioModelSelector } from "@/components/studio/studio-model-selector";

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
        <p className="text-sm text-muted-foreground">
          AI 辅助创作工作台：左侧对话 / 中间编辑 / 右侧操作与模板。
        </p>
      </div>
      <StudioModelSelector />
      <StudioLayout />
    </div>
  );
}
