import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleStatusBadge } from "./article-status-badge";

describe("ArticleStatusBadge", () => {
  it.each(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const)("%s 渲染中文标签", (status) => {
    render(<ArticleStatusBadge status={status} />);
    expect(screen.getByText(/草稿|审阅|已发布|已归档/)).toBeInTheDocument();
  });
});
