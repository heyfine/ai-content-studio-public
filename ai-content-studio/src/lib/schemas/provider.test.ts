import { describe, it, expect } from "vitest";
import { createProviderSchema, updateProviderSchema, providerTypeEnum } from "./provider";

describe("providerTypeEnum", () => {
  it("包含四种供应商类型", () => {
    expect(providerTypeEnum.options).toEqual([
      "OPENAI",
      "OPENAI_COMPATIBLE",
      "ANTHROPIC",
      "GEMINI",
    ]);
  });
});

describe("createProviderSchema", () => {
  it("OPENAI + apiKey 合法", () => {
    const r = createProviderSchema.safeParse({
      name: "OpenAI",
      type: "OPENAI",
      apiKey: "sk-x",
      baseUrl: "",
    });
    expect(r.success).toBe(true);
  });

  it("OPENAI_COMPATIBLE 缺 baseUrl 不合法", () => {
    const r = createProviderSchema.safeParse({
      name: "DS",
      type: "OPENAI_COMPATIBLE",
      apiKey: "k",
      baseUrl: "",
    });
    expect(r.success).toBe(false);
  });

  it("OPENAI_COMPATIBLE 带 baseUrl 合法", () => {
    const r = createProviderSchema.safeParse({
      name: "DS",
      type: "OPENAI_COMPATIBLE",
      apiKey: "k",
      baseUrl: "https://api.deepseek.com",
    });
    expect(r.success).toBe(true);
  });

  it("缺 apiKey 不合法", () => {
    const r = createProviderSchema.safeParse({ name: "X", type: "OPENAI" });
    expect(r.success).toBe(false);
  });

  it("非法 URL 不合法", () => {
    const r = createProviderSchema.safeParse({
      name: "X",
      type: "OPENAI_COMPATIBLE",
      apiKey: "k",
      baseUrl: "not-url",
    });
    expect(r.success).toBe(false);
  });

  it("enabled 可选默认不传也合法", () => {
    const r = createProviderSchema.safeParse({
      name: "X",
      type: "ANTHROPIC",
      apiKey: "k",
    });
    expect(r.success).toBe(true);
  });
});

describe("updateProviderSchema", () => {
  it("部分更新合法——只传 name", () => {
    const r = updateProviderSchema.safeParse({ name: "新名" });
    expect(r.success).toBe(true);
  });

  it("空对象合法（全可选）", () => {
    const r = updateProviderSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});
