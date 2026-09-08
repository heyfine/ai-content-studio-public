import { describe, it, expect } from "vitest";
import { loginSchema } from "./auth-schema";

describe("loginSchema", () => {
  it("接受合法 email 与非空密码", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "123" });
    expect(r.success).toBe(true);
  });

  it("接受自定义账号（不强制邮箱格式）", () => {
    const r = loginSchema.safeParse({ email: "xiaowang", password: "123" });
    expect(r.success).toBe(true);
  });

  it("账号首尾空白被 trim", () => {
    const r = loginSchema.safeParse({ email: "  xiaowang  ", password: "123" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("xiaowang");
  });

  it("拒绝空账号", () => {
    const r = loginSchema.safeParse({ email: "", password: "123" });
    expect(r.success).toBe(false);
  });

  it("拒绝纯空白账号", () => {
    const r = loginSchema.safeParse({ email: "   ", password: "123" });
    expect(r.success).toBe(false);
  });

  it("拒绝超长账号", () => {
    const r = loginSchema.safeParse({ email: "a".repeat(121), password: "123" });
    expect(r.success).toBe(false);
  });

  it("拒绝空密码", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });
});
