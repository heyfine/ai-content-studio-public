import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const { signIn, push, refresh } = vi.hoisted(() => ({
  signIn: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signIn }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams("callbackUrl=/dashboard"),
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    signIn.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("空提交显示邮箱与密码校验错误", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(screen.getByText("请输入邮箱")).toBeInTheDocument();
      expect(screen.getByText("请输入密码")).toBeInTheDocument();
    });
  });

  it("成功登录跳转 callbackUrl", async () => {
    signIn.mockResolvedValue({ error: null });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("登录失败显示凭证错误", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByText("邮箱或密码错误")).toBeInTheDocument());
  });
});
