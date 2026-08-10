import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut }));

import { UserNav } from "./user-nav";

describe("UserNav", () => {
  it("无 session 显示登录入口", () => {
    render(<UserNav session={null} />);
    expect(screen.getByText("登录")).toBeInTheDocument();
  });

  it("有 session 显示用户首字母触发器", () => {
    render(<UserNav session={{ user: { name: "Alice", email: "a@b.com" } } as never} />);
    expect(screen.getByLabelText("用户菜单")).toHaveTextContent("A");
  });
});
