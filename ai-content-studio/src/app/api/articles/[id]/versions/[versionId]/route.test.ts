import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, listVersionsMock, getVersionMock, deleteVersionMock, restoreVersionMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    listVersionsMock: vi.fn(),
    getVersionMock: vi.fn(),
    deleteVersionMock: vi.fn(),
    restoreVersionMock: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-version-service", () => ({
  listVersions: listVersionsMock,
  getVersion: getVersionMock,
  deleteVersion: deleteVersionMock,
  restoreVersion: restoreVersionMock,
}));

import { GET as listRoute } from "../route";
import { POST as restoreRoute } from "./restore/route";
import { DELETE as deleteRoute, GET as detailRoute } from "./route";

const listParams = { params: Promise.resolve({ id: "a1" }) };
const detailParams = { params: Promise.resolve({ id: "a1", versionId: "v1" }) };

describe("versions API", () => {
  beforeEach(() => {
    authMock.mockReset();
    listVersionsMock.mockReset();
    getVersionMock.mockReset();
    deleteVersionMock.mockReset();
    restoreVersionMock.mockReset();
  });

  it("未登录统一 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await listRoute(new Request("https://x"), listParams)).status).toBe(401);
    expect((await detailRoute(new Request("https://x"), detailParams)).status).toBe(401);
    expect((await deleteRoute(new Request("https://x"), detailParams)).status).toBe(401);
    expect((await restoreRoute(new Request("https://x"), detailParams)).status).toBe(401);
  });

  it("列表返回版本数组", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listVersionsMock.mockResolvedValue([{ id: "v1", source: "save", size: 3 }]);
    const res = await listRoute(new Request("https://x"), listParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "v1", source: "save", size: 3 }]);
    expect(listVersionsMock).toHaveBeenCalledWith("a1");
  });

  it("版本详情：存在返回内容，404 当不存在", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    getVersionMock.mockResolvedValueOnce({ id: "v1", content: "旧正文" });
    const ok = await detailRoute(new Request("https://x"), detailParams);
    expect(ok.status).toBe(200);
    getVersionMock.mockResolvedValueOnce(null);
    const missing = await detailRoute(new Request("https://x"), detailParams);
    expect(missing.status).toBe(404);
  });

  it("删除版本：成功 ok，404 当不存在", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    deleteVersionMock.mockResolvedValueOnce(undefined);
    expect((await deleteRoute(new Request("https://x"), detailParams)).status).toBe(200);
    deleteVersionMock.mockRejectedValueOnce(new Error("版本不存在"));
    expect((await deleteRoute(new Request("https://x"), detailParams)).status).toBe(404);
  });

  it("恢复版本：成功 ok，404 当版本不存在", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    restoreVersionMock.mockResolvedValueOnce(undefined);
    expect((await restoreRoute(new Request("https://x"), detailParams)).status).toBe(200);
    expect(restoreVersionMock).toHaveBeenCalledWith("a1", "v1");
    restoreVersionMock.mockRejectedValueOnce(new Error("版本不存在"));
    expect((await restoreRoute(new Request("https://x"), detailParams)).status).toBe(404);
  });
});
