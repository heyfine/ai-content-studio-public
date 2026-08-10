import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth }));

import { Header } from "./header";

describe("Header", () => {
  it("已登录时渲染用户首字母", async () => {
    auth.mockResolvedValue({ user: { name: "Alice", email: "a@b.com" } } as never);
    render(await Header());
    expect(screen.getByLabelText("用户菜单")).toHaveTextContent("A");
  });

  it("未登录时渲染登录入口", async () => {
    auth.mockResolvedValue(null);
    render(await Header());
    expect(screen.getByText("登录")).toBeInTheDocument();
  });
});
