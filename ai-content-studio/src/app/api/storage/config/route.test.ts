// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    storageConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, PUT } from "./route";

// saveStorageConfig 内部用 crypto.ts 加密 secretKey，测试环境补一个合法 32 字节 base64 key
process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";

function jsonRequest(body: unknown) {
  return new Request("https://x/api/storage/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const session = { user: { id: "u1", role: "ADMIN" } };
const validBody = {
  name: "数据胶囊",
  providerId: "data_capsule",
  endpoint: "https://s3.cstcloud.cn/",
  region: "us-east-1",
  bucket: "acs",
  accessKeyId: "AKID",
  secretKey: "SECRET",
  publicBase: "",
  keyPrefix: "acs/",
  clientApp: "s3drive",
  enabled: true,
};

describe("/api/storage/config", () => {
  beforeEach(() => {
    authMock.mockReset();
    for (const fn of Object.values(prismaMock.storageConfig)) {
      fn.mockReset();
    }
  });

  it("GET 未登录 401；登录返回脱敏列表", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    authMock.mockResolvedValue(session);
    prismaMock.storageConfig.findMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toEqual([]);
  });

  it("PUT 未登录 401；非法端点 400", async () => {
    authMock.mockResolvedValue(null);
    expect((await PUT(jsonRequest(validBody))).status).toBe(401);
    authMock.mockResolvedValue(session);
    const res = await PUT(jsonRequest({ ...validBody, endpoint: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("PUT 新建：启用时先全量下线，secretKey 加密入库，返回脱敏配置", async () => {
    authMock.mockResolvedValue(session);
    prismaMock.storageConfig.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.storageConfig.create.mockResolvedValue({
      id: "s1",
      name: "数据胶囊",
      providerId: "data_capsule",
      endpoint: "https://s3.cstcloud.cn",
      region: "us-east-1",
      bucket: "acs",
      accessKeyId: "AKID",
      secretKey: "enc",
      publicBase: "",
      keyPrefix: "acs/",
      clientApp: "s3drive",
      enabled: true,
    });
    const res = await PUT(jsonRequest(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accessKeyId: string; secretKey?: string };
    expect(body.accessKeyId).toBe("AKID");
    expect(body.secretKey).toBeUndefined();
    expect(prismaMock.storageConfig.updateMany).toHaveBeenCalledWith({
      where: { enabled: true },
      data: { enabled: false },
    });
    const createArg = prismaMock.storageConfig.create.mock.calls[0][0] as {
      data: { endpoint: string; providerId: string; clientApp: string; secretKey: string };
    };
    expect(createArg.data.endpoint).toBe("https://s3.cstcloud.cn");
    expect(createArg.data.providerId).toBe("data_capsule");
    expect(createArg.data.clientApp).toBe("s3drive");
    expect(createArg.data.secretKey).not.toBe("SECRET");
  });

  it("PUT 编辑留空 secretKey：不覆盖已存密钥；id 不存在 404", async () => {
    authMock.mockResolvedValue(session);
    prismaMock.storageConfig.findUnique.mockResolvedValueOnce(null);
    const bodyNoSecret = { ...validBody, secretKey: "", enabled: false };
    expect(
      (await PUT(jsonRequest({ ...bodyNoSecret, id: "01890a5d-ac96-774b-bcce-b302099a8057" })))
        .status,
    ).toBe(404);

    prismaMock.storageConfig.findUnique.mockResolvedValueOnce({ id: "s1" });
    prismaMock.storageConfig.update.mockResolvedValue({
      id: "s1",
      name: validBody.name,
      providerId: "data_capsule",
      endpoint: "https://s3.cstcloud.cn",
      region: "us-east-1",
      bucket: "acs",
      accessKeyId: "AKID",
      secretKey: "enc-old",
      publicBase: "",
      keyPrefix: "acs/",
      clientApp: "s3drive",
      enabled: false,
    });
    const res = await PUT(
      jsonRequest({ ...bodyNoSecret, id: "01890a5d-ac96-774b-bcce-b302099a8057" }),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.storageConfig.update.mock.calls[0][0] as {
      where: { id: string };
      data: { secretKey?: string };
    };
    expect(updateArg.data.secretKey).toBeUndefined();
  });
});
