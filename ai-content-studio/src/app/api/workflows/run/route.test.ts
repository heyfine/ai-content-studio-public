import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, runWorkflowMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  runWorkflowMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/workflow-service", () => ({ runWorkflow: runWorkflowMock }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/workflows/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/workflows/run", () => {
  beforeEach(() => {
    authMock.mockReset();
    runWorkflowMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ topic: "T" }));
    expect(res.status).toBe(401);
  });

  it("缺 topic 返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("成功执行返回 run 与 result", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    runWorkflowMock.mockResolvedValue({
      run: {
        id: "r1",
        topic: "T",
        status: "SUCCEEDED",
        articleId: "a1",
        error: null,
        steps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      result: {
        status: "success",
        steps: [{ id: "outline", name: "选题/大纲", output: { status: "success" } }],
      },
    });
    const res = await POST(makeRequest({ topic: "T", configId: "c1", wpStatus: "draft" }));
    expect(res.status).toBe(200);
    expect(runWorkflowMock).toHaveBeenCalledWith("T", {
      configId: "c1",
      promptId: undefined,
      wpStatus: "draft",
    });
    const data = await res.json();
    expect(data.run.id).toBe("r1");
    expect(data.result.steps[0].id).toBe("outline");
  });

  it("工作流执行抛错返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    runWorkflowMock.mockRejectedValue(new Error("DB down"));
    const res = await POST(makeRequest({ topic: "T" }));
    expect(res.status).toBe(500);
  });
});
