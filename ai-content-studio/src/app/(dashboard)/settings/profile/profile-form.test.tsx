import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ProfileForm } from "./profile-form";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function typeInput(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
});

describe("ProfileForm", () => {
  it("渲染邮箱（只读）与用户名初值", () => {
    render(<ProfileForm email="a@b.com" initialName="Alice" />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toHaveValue("Alice");
  });

  it("保存用户名：请求体正确 + 成功提示 + router.refresh", async () => {
    fetchMock.mockResolvedValue(okJson({ id: "u1", email: "a@b.com", name: "Bob" }));
    render(<ProfileForm email="a@b.com" initialName="Alice" />);
    typeInput("用户名", "Bob");
    fireEvent.click(screen.getByText("保存用户名"));
    await waitFor(() => expect(screen.getByText("已保存")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/profile",
      expect.objectContaining({ method: "PUT" }),
    );
    const init = fetchMock.mock.calls[0][1] as { body: string };
    expect(JSON.parse(init.body)).toEqual({ name: "Bob" });
    expect(refresh).toHaveBeenCalled();
  });

  it("保存失败显示后端错误文本", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "修改用户名失败" }), { status: 500 }),
    );
    render(<ProfileForm email="a@b.com" initialName="" />);
    typeInput("用户名", "Bob");
    fireEvent.click(screen.getByText("保存用户名"));
    await waitFor(() => expect(screen.getByText("修改用户名失败")).toBeInTheDocument());
  });

  it("修改密码：两次不一致被前端拦截", async () => {
    render(<ProfileForm email="a@b.com" initialName="" />);
    typeInput("当前密码", "oldpass1");
    typeInput("新密码（至少 8 位）", "newpass123");
    typeInput("确认新密码", "newpass999");
    fireEvent.click(screen.getByText("保存新密码"));
    await waitFor(() => expect(screen.getByText("两次输入的新密码不一致")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("修改密码成功：提示成功并清空输入", async () => {
    fetchMock.mockResolvedValue(okJson({ ok: true }));
    render(<ProfileForm email="a@b.com" initialName="" />);
    typeInput("当前密码", "oldpass1");
    typeInput("新密码（至少 8 位）", "newpass123");
    typeInput("确认新密码", "newpass123");
    fireEvent.click(screen.getByText("保存新密码"));
    await waitFor(() => expect(screen.getByText("密码已修改")).toBeInTheDocument());
    expect(screen.getByLabelText("当前密码")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/password",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("当前密码不正确：显示后端错误", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "当前密码不正确" }), { status: 400 }),
    );
    render(<ProfileForm email="a@b.com" initialName="" />);
    typeInput("当前密码", "wrongpass");
    typeInput("新密码（至少 8 位）", "newpass123");
    typeInput("确认新密码", "newpass123");
    fireEvent.click(screen.getByText("保存新密码"));
    await waitFor(() => expect(screen.getByText("当前密码不正确")).toBeInTheDocument());
  });
});
