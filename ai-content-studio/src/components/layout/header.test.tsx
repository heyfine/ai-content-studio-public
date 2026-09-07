import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth }));

import { Header } from "./header";

describe("Header", () => {
  it("已登录时渲染用户名与退出按钮", async () => {
    auth.mockResolvedValue({ user: { name: "Alice", email: "a@b.com" } } as never);
    render(await Header());
    expect(screen.getByRole("link", { name: /Alice/ })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.getByLabelText("退出登录")).toBeInTheDocument();
  });

  it("未登录时渲染登录入口", async () => {
    auth.mockResolvedValue(null);
    render(await Header());
    expect(screen.getByText("登录")).toBeInTheDocument();
  });
});
