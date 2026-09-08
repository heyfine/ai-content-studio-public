// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, storageMock, trashRemoteMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  storageMock: {
    testStorageConnection: vi.fn(),
    getEnabledStorageConfig: vi.fn(),
    listRemoteImages: vi.fn(),
    deleteRemoteObject: vi.fn(),
    describeStorageError: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  },
  trashRemoteMock: {
    listRemoteTrash: vi.fn(),
    trashRemoteImage: vi.fn(),
    restoreRemoteImage: vi.fn(),
    purgeRemoteImage: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/storage-service", () => storageMock);
vi.mock("@/lib/services/image-trash-service", () => trashRemoteMock);

import { DELETE as imageDelete } from "./images/[key]/route";
import { GET as imagesGet } from "./images/route";
import { POST as testPost } from "./test/route";

const session = { user: { id: "u1", role: "ADMIN" } };
const row = {
  id: "s1",
  name: "缤纷云",
  endpoint: "https://s3.example.com",
  region: "auto",
  bucket: "acs-media",
  accessKeyId: "AKID",
  secretKey: "enc",
  publicBase: "https://acs-media.example.com",
  keyPrefix: "acs/",
  enabled: true,
};

describe("/api/storage/test", () => {
  beforeEach(() => {
    authMock.mockReset();
    storageMock.testStorageConnection.mockReset();
  });

  function testRequest() {
    return new Request("https://x/api/storage/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://s3.example.com",
        bucket: "b",
        accessKeyId: "a",
        secretKey: "s",
      }),
    });
  }

  it("未登录 401；成功返回桶名；失败 502 带中文原因", async () => {
    authMock.mockResolvedValue(null);
    expect((await testPost(testRequest())).status).toBe(401);

    authMock.mockResolvedValue(session);
    storageMock.testStorageConnection.mockResolvedValue({ ok: true, bucket: "b" });
    const okRes = await testPost(testRequest());
    expect(okRes.status).toBe(200);
    expect((await okRes.json()) as { ok: boolean }).toEqual({ ok: true, bucket: "b" });

    // 每次调用用新 Request（body 流不可重复读取）
    storageMock.testStorageConnection.mockRejectedValue(new Error("AccessDenied 403"));
    const badRes = await testPost(testRequest());
    expect(badRes.status).toBe(502);
    expect(((await badRes.json()) as { cause: string }).cause).toContain("403");
  });
});

describe("/api/storage/images", () => {
  beforeEach(() => {
    authMock.mockReset();
    storageMock.getEnabledStorageConfig.mockReset();
    storageMock.listRemoteImages.mockReset();
    storageMock.deleteRemoteObject.mockReset();
  });

  it("未启用对象存储：enabled=false 空列表", async () => {
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
    const res = await imagesGet();
    expect((await res.json()) as { enabled: boolean }).toEqual({ enabled: false, images: [] });
  });

  it("启用时返回列举结果（拼好公网 URL）", async () => {
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(row);
    storageMock.listRemoteImages.mockResolvedValue([
      {
        key: "acs/a.png",
        url: "https://acs-media.example.com/acs/a.png",
        size: 1,
        mtime: "2026-01-01T00:00:00Z",
      },
    ]);
    const res = await imagesGet();
    const body = (await res.json()) as { enabled: boolean; images: Array<{ url: string }> };
    expect(body.enabled).toBe(true);
    expect(body.images[0].url).toContain("/acs/a.png");
  });

  it("DELETE：移入回收站前缀；前缀外 403", async () => {
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(row);
    const params = (key: string) => ({ params: Promise.resolve({ key }) });

    const okRes = await imageDelete(new Request("https://x"), params("acs%2Fa.png"));
    expect(okRes.status).toBe(200);
    expect(trashRemoteMock.trashRemoteImage).toHaveBeenCalledWith(row, "acs/a.png");

    trashRemoteMock.trashRemoteImage.mockRejectedValueOnce(
      new Error("仅允许移入本应用前缀下的对象：other/b.png"),
    );
    const outsideRes = await imageDelete(new Request("https://x"), params("other%2Fb.png"));
    expect(outsideRes.status).toBe(403);
  });
});
