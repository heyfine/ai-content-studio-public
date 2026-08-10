import { GenerateTestClient } from "@/components/studio/generate-test-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
        <p className="text-sm text-muted-foreground">AI 辅助创作工作台。</p>
      </div>
      <GenerateTestClient />
    </div>
  );
}
