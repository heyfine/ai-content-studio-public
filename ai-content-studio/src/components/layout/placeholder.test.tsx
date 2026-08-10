import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderPage } from "./placeholder";

describe("PlaceholderPage", () => {
  it("渲染标题、描述与待实装提示", () => {
    render(<PlaceholderPage title="SEO" description="SEO 分析（Phase 2 上线）。" />);
    expect(screen.getByText("SEO")).toBeInTheDocument();
    expect(screen.getByText("SEO 分析（Phase 2 上线）。")).toBeInTheDocument();
    expect(screen.getByText("该模块将在后续 Phase 实装。")).toBeInTheDocument();
  });
});
