import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listRunsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listRunsMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/workflow-service", () => ({ listWorkflowRuns: listRunsMock }));

import { GET } from "./route";

describe("GET /api/workflows", () => {
  beforeEach(() => {
    authMock.mockReset();
    listRunsMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("返回工作流列表", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listRunsMock.mockResolvedValue([
      {
        id: "r1",
        topic: "T1",
        status: "SUCCEEDED",
        steps: [],
        articleId: "a1",
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("r1");
  });
});
