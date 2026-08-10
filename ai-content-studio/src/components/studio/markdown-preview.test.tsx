import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "./markdown-preview";

describe("MarkdownPreview", () => {
  it("渲染标题与段落", () => {
    render(<MarkdownPreview content="# 标题" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("标题");
  });

  it("渲染列表", () => {
    render(<MarkdownPreview content={"- 项甲\n- 项乙"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("项甲");
    expect(items[1]).toHaveTextContent("项乙");
  });

  it("渲染代码块", () => {
    render(<MarkdownPreview content={"```ts\nconst x = 1;\n```"} />);
    expect(screen.getByText(/const x = 1/)).toBeInTheDocument();
  });

  it("渲染链接", () => {
    render(<MarkdownPreview content="[OpenAI](https://openai.com)" />);
    const link = screen.getByRole("link", { name: "OpenAI" });
    expect(link).toHaveAttribute("href", "https://openai.com");
  });

  it("空内容渲染空容器", () => {
    render(<MarkdownPreview content="" />);
    expect(screen.getByTestId("markdown-preview")).toBeEmptyDOMElement();
  });

  it("GFM 表格渲染为 table 元素", () => {
    render(<MarkdownPreview content={"| a | b |\n| --- | --- |\n| 1 | 2 |"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("GFM 删除线渲染为 del 标签", () => {
    render(<MarkdownPreview content={"~~删除~~"} />);
    expect(screen.getByText("删除").tagName.toLowerCase()).toBe("del");
  });
});
