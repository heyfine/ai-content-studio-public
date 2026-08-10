import { Badge } from "@/components/ui/badge";

export type ProviderType = "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";

const labels: Record<ProviderType, string> = {
  OPENAI: "OpenAI",
  OPENAI_COMPATIBLE: "OpenAI 兼容",
  ANTHROPIC: "Anthropic",
  GEMINI: "Gemini",
};

export function ProviderTypeBadge({ type }: { type: ProviderType }) {
  return <Badge variant="secondary">{labels[type]}</Badge>;
}
