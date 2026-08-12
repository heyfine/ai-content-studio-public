import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listMock, validateMock, extractMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listMock: vi.fn(),
  validateMock: vi.fn(),
  extractMock: vi.fn(),
}));

vi.mock("@/lib/services/relay-service", () => ({
  validateRelayKey: validateMock,
  listEnabledModels: listMock,
}));
vi.mock("@/lib/relay/auth", () => ({ extractBearerKey: extractMock }));

import { GET } from "./route";

function makeRequest(auth?: string) {
  return new Request("https://localhost/v1/models", {
    headers: auth ? { Authorization: auth } : {},
  });
}

describe("GET /v1/models", () => {
  beforeEach(() => {
    extractMock.mockReset();
    validateMock.mockReset();
    listMock.mockReset();
  });

  it("缺 Bearer 返回 401", async () => {
    extractMock.mockReturnValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.type).toBe("invalid_api_key");
    expect(validateMock).not.toHaveBeenCalled();
  });

  it("无效 Key 返回 401", async () => {
    extractMock.mockReturnValue("sk-relay-bad");
    validateMock.mockResolvedValue(null);
    const res = await GET(makeRequest("Bearer sk-relay-bad"));
    expect(res.status).toBe(401);
  });

  it("有效 Key 返回 list 形状与正确 id", async () => {
    extractMock.mockReturnValue("sk-relay-good");
    validateMock.mockResolvedValue({ id: "k1", name: "外部" });
    listMock.mockResolvedValue([
      {
        id: "基元律动/deepseek-v4-flash-0731",
        object: "model",
        created: 1767225600,
        owned_by: "基元律动",
      },
    ]);
    const res = await GET(makeRequest("Bearer sk-relay-good"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("list");
    expect(body.data[0].id).toBe("基元律动/deepseek-v4-flash-0731");
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});
