import { describe, it, expect } from "vitest";

function makeRequest(auth?: string) {
  return new Request("https://localhost/x", {
    headers: auth ? { Authorization: auth } : {},
  });
}

describe("extractBearerKey", () => {
  it("正确提取 Bearer token", async () => {
    const { extractBearerKey } = await import("./auth");
    const req = makeRequest("Bearer sk-relay-abc123");
    expect(extractBearerKey(req)).toBe("sk-relay-abc123");
  });

  it("大小写不敏感", async () => {
    const { extractBearerKey } = await import("./auth");
    const req = makeRequest("bearer sk-relay-x");
    expect(extractBearerKey(req)).toBe("sk-relay-x");
  });

  it("带前后空格也能提取", async () => {
    const { extractBearerKey } = await import("./auth");
    const req = makeRequest("  Bearer   sk-relay-y  ");
    expect(extractBearerKey(req)).toBe("sk-relay-y");
  });

  it("缺失 Authorization 头返回 null", async () => {
    const { extractBearerKey } = await import("./auth");
    expect(extractBearerKey(makeRequest())).toBeNull();
  });

  it("非 Bearer scheme 返回 null", async () => {
    const { extractBearerKey } = await import("./auth");
    const req = makeRequest("Basic abc123");
    expect(extractBearerKey(req)).toBeNull();
  });
});
