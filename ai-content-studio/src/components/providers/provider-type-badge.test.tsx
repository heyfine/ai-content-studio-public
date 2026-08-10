import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderTypeBadge } from "./provider-type-badge";

describe("ProviderTypeBadge", () => {
  it.each([
    ["OPENAI", "OpenAI"],
    ["OPENAI_COMPATIBLE", "OpenAI 兼容"],
    ["ANTHROPIC", "Anthropic"],
    ["GEMINI", "Gemini"],
  ] as const)("%s 显示 %s", (type, label) => {
    render(<ProviderTypeBadge type={type} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
