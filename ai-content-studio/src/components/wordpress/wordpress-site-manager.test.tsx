import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { WordPressSiteManager, type WpSiteOption } from "./wordpress-site-manager";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const sites: WpSiteOption[] = [
  {
    id: "c1",
    name: "技术博客",
    siteUrl: "https://tech.example.com",
    username: "admin",
    enabled: true,
  },
  {
    id: "c2",
    name: "生活博客",
    siteUrl: "https://life.example.com",
    username: "me",
    enabled: false,
  },
];

describe("WordPressSiteManager", () => {
  beforeEach(() => fetchMock.mockReset());

  it("渲染站点列表与新建站点按钮", () => {
    render(<WordPressSiteManager configs={sites} onChange={vi.fn()} />);
    expect(screen.getByText("WordPress 站点管理")).toBeInTheDocument();
    expect(screen.getAllByTestId("wp-site-row")).toHaveLength(2);
    expect(screen.getByText("技术博客")).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/tech.example.com/)).toBeInTheDocument();
    expect(screen.getByTestId("wp-new-site")).toBeInTheDocument();
  });

  it("空列表显示引导提示", () => {
    render(<WordPressSiteManager configs={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/还没有 WordPress 站点/)).toBeInTheDocument();
  });

  it("新建站点：打开对话框、填写并提交 POST、回调 onChange", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "c9" }) });
    render(<WordPressSiteManager configs={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("wp-new-site"));
    await waitFor(() => expect(screen.getByText("新建 WordPress 站点")).toBeInTheDocument());
    // 配置说明提示存在
    expect(screen.getByText("配置说明")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("站点名称（备注）"), { target: { value: "新博客" } });
    fireEvent.change(screen.getByLabelText("站点 URL"), {
      target: { value: "https://new.example.com/" },
    });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "root" } });
    fireEvent.change(screen.getByLabelText("应用密码"), { target: { value: "app-pwd" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wordpress/configs",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onChange).toHaveBeenCalled();
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: "新博客",
      username: "root",
      appPassword: "app-pwd",
      enabled: true,
    });
  });

  it("新建站点表单校验：URL 不合法时保存按钮禁用且不提交", async () => {
    render(<WordPressSiteManager configs={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("wp-new-site"));
    await waitFor(() => expect(screen.getByText("新建 WordPress 站点")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("站点名称（备注）"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("站点 URL"), { target: { value: "not-a-url" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "u" } });
    fireEvent.change(screen.getByLabelText("应用密码"), { target: { value: "p" } });
    expect(screen.getByText("保存").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("保存"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("编辑站点：预填并提交 PUT", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) });
    render(<WordPressSiteManager configs={sites} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("编辑站点 技术博客"));
    await waitFor(() => expect(screen.getByText("编辑站点")).toBeInTheDocument());
    expect((screen.getByLabelText("站点名称（备注）") as HTMLInputElement).value).toBe("技术博客");
    fireEvent.change(screen.getByLabelText("站点名称（备注）"), {
      target: { value: "技术博客改名" },
    });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wordpress/configs/c1",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.name).toBe("技术博客改名");
  });

  it("启用开关点击发 PUT enabled 并刷新", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "c2" }) });
    render(<WordPressSiteManager configs={sites} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("wp-toggle-c2"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wordpress/configs/c2",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(onChange).toHaveBeenCalled();
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.enabled).toBe(true);
  });

  it("删除站点：确认后发 DELETE 并刷新", async () => {
    const onChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<WordPressSiteManager configs={sites} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("删除站点 技术博客"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/wordpress/configs/c1", { method: "DELETE" });
      expect(onChange).toHaveBeenCalled();
    });
    confirmSpy.mockRestore();
  });
});
