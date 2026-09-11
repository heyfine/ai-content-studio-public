import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { absolutizeImageUrls, SourceExportDialog } from "./source-export-dialog";

const writeTextMock = vi.fn(async () => undefined);

beforeEach(() => {
  writeTextMock.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

describe("absolutizeImageUrls", () => {
  it("站内相对路径改写为绝对 URL", () => {
    const html = '<p><img src="/uploads/a.png" alt="a"></p>';
    expect(absolutizeImageUrls(html, "https://src.example.com")).toContain(
      'src="https://src.example.com/uploads/a.png"',
    );
  });

  it("对象存储代理相对路径同样改写", () => {
    const html = '<img src="/api/storage/object/acs%2Fb.png">';
    expect(absolutizeImageUrls(html, "https://bingo.example.cc")).toContain(
      'src="https://bingo.example.cc/api/storage/object/acs%2Fb.png"',
    );
  });

  it("http(s)/data:/blob: 非相对路径原样保留", () => {
    const html =
      '<img src="https://other.example.com/x.png"><img src="data:image/png;base64,AA"><img src="blob:https://x/y">';
    const out = absolutizeImageUrls(html, "https://src.example.com");
    expect(out).toContain('src="https://other.example.com/x.png"');
    expect(out).toContain('src="data:image/png;base64,AA"');
    expect(out).toContain('src="blob:https://x/y"');
  });

  it("无图片的 HTML 原样返回正文内容", () => {
    const html = "<p>纯文本</p>";
    expect(absolutizeImageUrls(html, "https://src.example.com")).toContain("纯文本");
  });
});

describe("SourceExportDialog", () => {
  it("open 时展示源码与迁移说明", () => {
    render(
      <SourceExportDialog open={true} onOpenChange={() => {}} source="<h2>标题</h2><p>正文</p>" />,
    );
    expect(screen.getByTestId("source-export-text")).toHaveValue("<h2>标题</h2><p>正文</p>");
    expect(screen.getByText(/HTML 源码转换/)).toBeInTheDocument();
  });

  it("点击复制按钮写入剪贴板并显示已复制", async () => {
    render(<SourceExportDialog open={true} onOpenChange={() => {}} source="<p>源码</p>" />);
    fireEvent.click(screen.getByTestId("source-copy"));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("<p>源码</p>"));
    await waitFor(() => expect(screen.getByText("已复制")).toBeInTheDocument());
  });

  it("源码为空时复制按钮禁用", () => {
    render(<SourceExportDialog open={true} onOpenChange={() => {}} source="" />);
    expect(screen.getByTestId("source-copy")).toBeDisabled();
  });

  it("onOpenChange(false) 关闭对话框", () => {
    const onOpenChange = vi.fn();
    render(<SourceExportDialog open={true} onOpenChange={onOpenChange} source="<p>x</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
