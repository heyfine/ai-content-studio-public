// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, s3Mock } = vi.hoisted(() => ({
  prismaMock: {
    storageConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  s3Mock: {
    send: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = s3Mock.send;
    destroy = s3Mock.destroy;
  },
  CopyObjectCommand: class {},
  DeleteObjectCommand: class {},
  GetObjectCommand: class {},
  HeadBucketCommand: class {},
  ListObjectsV2Command: class {},
  PutObjectCommand: class {},
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => s.replace("enc:", "")),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { listRemoteImages } from "./storage-service";

const storageRow = {
  id: "s1",
  name: "缤纷云",
  providerId: "bitiful",
  endpoint: "https://s3.example.com",
  region: "cn-east-1",
  bucket: "acs-media",
  accessKeyId: "AKID",
  secretKey: "enc:sk",
  publicBase: "https://acs-media.example.com",
  keyPrefix: "acs/",
  clientApp: "",
  enabled: true,
};

describe("listRemoteImages 排除回收站前缀", () => {
  beforeEach(() => {
    s3Mock.send.mockReset();
    s3Mock.destroy.mockReset();
  });

  it("主前缀列表过滤掉 acs/trash/ 下的对象（回收站副本不重复出现在主列表）", async () => {
    s3Mock.send.mockImplementation(async (cmd: { input?: { Prefix?: string } }) => ({
      Contents: [
        { Key: "acs/keep.png", Size: 1, LastModified: new Date("2026-09-07T09:00:00Z") },
        { Key: "acs/trash/deleted.png", Size: 2, LastModified: new Date("2026-09-06T09:00:00Z") },
        { Key: "acs/trash/another.jpg", Size: 3, LastModified: new Date("2026-09-05T09:00:00Z") },
      ],
      IsTruncated: false,
    }));
    const images = await listRemoteImages(storageRow);
    expect(images.map((i) => i.key)).toEqual(["acs/keep.png"]);
  });

  it("回收站列表用 trash 前缀列举时不受排除影响（排除项只对主前缀列表生效）", async () => {
    // listRemoteTrash 走 listObjectsUnderPrefix(row, "acs/trash/") 且 excludePrefixes=[]——语义上由调用方保证；
    // 这里验证 listObjectsUnderPrefix 不带排除时全量返回
    const { listObjectsUnderPrefix } = await import("./storage-service");
    s3Mock.send.mockImplementation(async () => ({
      Contents: [{ Key: "acs/trash/x.png", Size: 1, LastModified: new Date() }],
      IsTruncated: false,
    }));
    const items = await listObjectsUnderPrefix(storageRow, "acs/trash/");
    expect(items).toHaveLength(1);
    expect(items[0]?.key).toBe("acs/trash/x.png");
  });
});
