import { PromptsClient } from "@/components/prompts/prompts-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prompt</h1>
        <p className="text-sm text-muted-foreground">提示词模板库，按类型管理版本与启用状态。</p>
      </div>
      <PromptsClient />
    </div>
  );
}
