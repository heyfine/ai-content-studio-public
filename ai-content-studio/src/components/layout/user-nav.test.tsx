import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { UserNav } from "./user-nav";

describe("UserNav", () => {
  it("无 session 显示登录入口", () => {
    render(<UserNav session={null} />);
    expect(screen.getByText("登录")).toBeInTheDocument();
  });

  it("有 session：显示用户名链接指向账号设置 + 独立退出按钮", () => {
    render(<UserNav session={{ user: { name: "Alice", email: "a@b.com" } } as never} />);
    const profileLink = screen.getByRole("link", { name: /Alice/ });
    expect(profileLink).toHaveAttribute("href", "/settings/profile");
    expect(screen.getByLabelText("退出登录")).toBeInTheDocument();
  });

  it("无用户名时回退显示邮箱", () => {
    render(<UserNav session={{ user: { name: null, email: "a@b.com" } } as never} />);
    expect(screen.getByRole("link", { name: /a@b\.com/ })).toBeInTheDocument();
  });

  it("点击退出按钮调用 signOut 并跳登录页", () => {
    render(<UserNav session={{ user: { name: "Alice", email: "a@b.com" } } as never} />);
    fireEvent.click(screen.getByLabelText("退出登录"));
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
