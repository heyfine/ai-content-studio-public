import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, findUnique, create, update, del, encrypt, decrypt, providerFindMany } =
  vi.hoisted(() => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
    encrypt: vi.fn((plain: string) => "enc_" + plain),
    decrypt: vi.fn((payload: string) => payload.replace(/^enc_/, "")),
    providerFindMany: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    relayApiKey: { findMany, findUnique, create, update, delete: del },
    aIProvider: { findMany: providerFindMany },
  },
}));

vi.mock("@/lib/crypto", () => ({ encrypt, decrypt }));

import {
  createRelayKey,
  listRelayKeys,
  revealRelayKey,
  setRelayKeyEnabled,
  deleteRelayKey,
  validateRelayKey,
  listEnabledModels,
} from "./relay-service";

function row(
  over: Partial<{
    id: string;
    name: string;
    key: string;
    keyPrefix: string;
    enabled: boolean;
  }> = {},
) {
  return {
    id: "k1",
    name: "外部调用",
    key: "enc_sk-relay-aaa",
    keyPrefix: "sk-relay-aaa",
    enabled: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

describe("relay-service", () => {
  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    create.mockReset();
    update.mockReset();
    del.mockReset();
    encrypt.mockReset().mockImplementation((p: string) => "enc_" + p);
    decrypt.mockReset().mockImplementation((p: string) => p.replace(/^enc_/, ""));
    providerFindMany.mockReset();
  });

  it("createRelayKey 返回明文且库存密文", async () => {
    create.mockResolvedValue(row({ key: "enc_sk-relay-aaa111", keyPrefix: "sk-relay-aaa" }));
    const result = await createRelayKey("外部调用");
    expect(result.secret.startsWith("sk-relay-")).toBe(true);
    expect(result.secret.length).toBe(57);
    expect(result.row.keyMasked).toBe("sk-relay-aaa••••");
    expect(create.mock.calls[0][0].data.name).toBe("外部调用");
    expect(create.mock.calls[0][0].data.keyPrefix).toBe(result.secret.slice(0, 12));
    // 库存是密文而非明文
    expect(create.mock.calls[0][0].data.key.startsWith("enc_")).toBe(true);
  });

  it("listRelayKeys 返回掩码列表", async () => {
    findMany.mockResolvedValue([
      row({ id: "a", keyPrefix: "sk-relay-aaa" }),
      row({ id: "b", keyPrefix: "sk-relay-bbb", enabled: false }),
    ]);
    const list = await listRelayKeys();
    expect(list).toHaveLength(2);
    expect(list[0].keyMasked).toBe("sk-relay-aaa••••");
    expect(list[1].enabled).toBe(false);
    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });

  it("revealRelayKey 解密返回明文", async () => {
    findUnique.mockResolvedValue(row({ key: "enc_sk-relay-realtoken" }));
    const plain = await revealRelayKey("k1");
    expect(plain).toBe("sk-relay-realtoken");
  });

  it("revealRelayKey 不存在时抛错", async () => {
    findUnique.mockResolvedValue(null);
    await expect(revealRelayKey("nope")).rejects.toThrow("中转密钥不存在");
  });

  it("setRelayKeyEnabled 透传 enabled", async () => {
    update.mockResolvedValue(row({ enabled: false }));
    await setRelayKeyEnabled("k1", false);
    expect(update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { enabled: false } });
  });

  it("deleteRelayKey 透传 id", async () => {
    del.mockResolvedValue(row());
    await deleteRelayKey("k1");
    expect(del).toHaveBeenCalledWith({ where: { id: "k1" } });
  });

  it("validateRelayKey 匹配通过", async () => {
    findMany.mockResolvedValue([row({ key: "enc_sk-relay-matched" })]);
    const r = await validateRelayKey("sk-relay-matched");
    expect(r?.id).toBe("k1");
    expect(findMany).toHaveBeenCalledWith({ where: { enabled: true, keyPrefix: "sk-relay-mat" } });
  });

  it("validateRelayKey 不匹配返回 null", async () => {
    findMany.mockResolvedValue([row({ key: "enc_sk-relay-other" })]);
    const r = await validateRelayKey("sk-relay-matched");
    expect(r).toBeNull();
  });

  it("validateRelayKey 空输入返回 null", async () => {
    const r = await validateRelayKey("");
    expect(r).toBeNull();
  });

  it("listEnabledModels 格式为 供应商/模型（prisma 已按 enabled 过滤）", async () => {
    providerFindMany.mockResolvedValue([
      {
        id: "p1",
        name: "基元律动",
        enabled: true,
        models: [
          {
            id: "m1",
            name: "deepseek-v4-flash-0731",
            enabled: true,
            createdAt: new Date("2026-01-01"),
          },
          { id: "m2", name: "deepseek-chat", enabled: true, createdAt: new Date("2026-01-02") },
        ],
      },
    ]);
    const items = await listEnabledModels();
    expect(items.map((m) => m.id)).toEqual([
      "基元律动/deepseek-v4-flash-0731",
      "基元律动/deepseek-chat",
    ]);
    expect(items[0]).toEqual({
      id: "基元律动/deepseek-v4-flash-0731",
      object: "model",
      created: 1767225600,
      owned_by: "基元律动",
    });
    expect(providerFindMany).toHaveBeenCalledWith({
      where: { enabled: true },
      include: { models: { where: { enabled: true } } },
    });
  });
});
