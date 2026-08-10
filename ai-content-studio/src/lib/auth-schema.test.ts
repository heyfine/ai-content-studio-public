import { describe, it, expect } from "vitest";
import { loginSchema } from "./auth-schema";

describe("loginSchema", () => {
  it("接受合法 email 与非空密码", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "123" });
    expect(r.success).toBe(true);
  });

  it("拒绝空邮箱", () => {
    const r = loginSchema.safeParse({ email: "", password: "123" });
    expect(r.success).toBe(false);
  });

  it("拒绝非法邮箱", () => {
    const r = loginSchema.safeParse({ email: "not-email", password: "123" });
    expect(r.success).toBe(false);
  });

  it("拒绝空密码", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });
});
