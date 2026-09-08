import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, revealMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  revealMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/auto-backup-service", () => ({
  getAutoBackupSettings: vi.fn(),
  getAutoBackupStatus: vi.fn(),
  listBackupFiles: vi.fn(),
  restoreFromWebdav: vi.fn(),
  revealWebdavPassword: revealMock,
  runAutoBackup: vi.fn(),
  saveAutoBackupSettings: vi.fn(),
  testWebdavTarget: vi.fn(),
}));

import { POST } from "./route";

function post(body: unknown) {
  return new Request("https://x/api/backup/auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/backup/auto op=reveal", () => {
  beforeEach(() => {
    authMock.mockReset();
    revealMock.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(post({ op: "reveal", targetId: "t1" }));
    expect(res.status).toBe(401);
  });

  it("返回已存密码明文", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    revealMock.mockResolvedValue("dav-secret");
    const res = await POST(post({ op: "reveal", targetId: "t1" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { targetId: string; password: string };
    expect(data.password).toBe("dav-secret");
    expect(revealMock).toHaveBeenCalledWith("t1");
  });

  it("service 异常返回 400 带中文错误", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    revealMock.mockRejectedValue(new Error("未找到该 WebDAV 目标"));
    const res = await POST(post({ op: "reveal", targetId: "t9" }));
    expect(res.status).toBe(400);
  });
});
