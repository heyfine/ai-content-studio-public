// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  function makeDelegate() {
    return {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
    };
  }
  return {
    prismaMock: {
      user: makeDelegate(),
      article: makeDelegate(),
      articleVersion: makeDelegate(),
      prompt: makeDelegate(),
      aIProvider: makeDelegate(),
      aIModel: makeDelegate(),
      aITaskRoute: makeDelegate(),
      aIGeneration: makeDelegate(),
      articlePublish: makeDelegate(),
      seoReport: makeDelegate(),
      wordPressConfig: makeDelegate(),
      weChatConfig: makeDelegate(),
      weChatPublish: makeDelegate(),
      relayApiKey: makeDelegate(),
      workflowRun: makeDelegate(),
      source: makeDelegate(),
      sourceVersion: makeDelegate(),
      storageConfig: makeDelegate(),
      systemSetting: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getAutoBackupSettings,
  getAutoBackupStatus,
  runAutoBackup,
  saveAutoBackupSettings,
  validateAutoBackupSettings,
} from "./auto-backup-service";

const KV: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(KV)) delete KV[k];
  prismaMock.systemSetting.findUnique.mockImplementation(
    async ({ where }: { where: { key: string } }) =>
      where.key in KV ? { key: where.key, value: KV[where.key] } : null,
  );
  prismaMock.systemSetting.upsert.mockImplementation(
    async ({
      where,
      create,
    }: {
      where: { key: string };
      create: { key: string; value: string };
    }) => {
      KV[where.key] = create.value;
      return create;
    },
  );
  prismaMock.prompt.findMany.mockResolvedValue([{ id: "p1" }]);
});

function kvGet(key: string): string | null {
  return key in KV ? KV[key] : null;
}

describe("自动备份设置", () => {
  it("校验：URL 格式/用户名/间隔范围/至少一个启用目标", () => {
    expect(() =>
      validateAutoBackupSettings({
        enabled: true,
        targets: [{ url: "ftp://x", username: "u", enabled: true }],
      }),
    ).toThrow(/http/);
    expect(() =>
      validateAutoBackupSettings({
        enabled: true,
        targets: [{ url: "https://x", username: "", enabled: true }],
      }),
    ).toThrow(/用户名/);
    expect(() =>
      validateAutoBackupSettings({
        enabled: true,
        targets: [{ url: "https://x", username: "u", enabled: true, intervalHours: 1000 }],
      }),
    ).toThrow(/1~720/);
    expect(() =>
      validateAutoBackupSettings({
        enabled: true,
        targets: [{ url: "https://x", username: "u", enabled: false }],
      }),
    ).toThrow(/至少启用/);
  });

  it("保存：密码留空沿用已存；间隔变更重置 nextAt", async () => {
    await saveAutoBackupSettings(prismaMock as never, {
      enabled: true,
      targets: [
        {
          name: "t1",
          url: "https://dav.example.com/b",
          username: "u",
          password: "p",
          enabled: true,
          intervalHours: 2,
          keep: 3,
        },
      ],
    });
    const targetsRaw = kvGet("auto_backup_targets") ?? "{}";
    expect(targetsRaw).toContain('"p"');
    const first = JSON.parse(targetsRaw)[0] as { nextAt: number; id: string };

    await saveAutoBackupSettings(prismaMock as never, {
      enabled: true,
      targets: [
        {
          id: first.id,
          name: "t1",
          url: "https://dav.example.com/b",
          username: "u",
          enabled: true,
          intervalHours: 5,
          keep: 3,
        },
      ],
    });
    const second = JSON.parse(kvGet("auto_backup_targets") ?? "[]")[0] as {
      nextAt: number;
      intervalHours: number;
      password: string;
    };
    expect(second.password).toBe("p"); // 沿用
    expect(second.intervalHours).toBe(5);
    expect(second.nextAt).toBeGreaterThan(first.nextAt); // 间隔变更重置
  });

  it("getAutoBackupSettings 对外不回显密码（hasPassword）", async () => {
    await saveAutoBackupSettings(prismaMock as never, {
      enabled: false,
      targets: [
        {
          name: "t1",
          url: "https://dav.example.com/b",
          username: "u",
          password: "secret",
          enabled: false,
        },
      ],
    });
    const s = await getAutoBackupSettings(prismaMock as never);
    expect(s.enabled).toBe(false);
    expect(s.webdavTargets[0].hasPassword).toBe(true);
    expect(JSON.stringify(s)).not.toContain("secret");
  });

  it("状态：next/last 正确序列化", async () => {
    await saveAutoBackupSettings(prismaMock as never, {
      enabled: true,
      targets: [
        {
          name: "t1",
          url: "https://dav.example.com/b",
          username: "u",
          password: "p",
          enabled: true,
          intervalHours: 12,
        },
      ],
    });
    const status = await getAutoBackupStatus(prismaMock as never);
    expect(status.nextBackupAt).toBeTruthy();
    expect(status.lastBackupStatus).toBeNull();
  });
});

describe("runAutoBackup", () => {
  it("未启用且非 force：跳过", async () => {
    const r = await runAutoBackup({ prisma: prismaMock as never });
    expect(r.ran).toBe(false);
    expect(r.reason).toBe("disabled");
  });

  it("force：整站备份推送到启用目标（注入 fetch），更新 nextAt 与历史", async () => {
    // 全量备份会遍历所有模型：给每个可能的 delegate 补 findMany 兜底
    for (const [, delegate] of Object.entries(
      prismaMock as unknown as Record<string, { findMany?: ReturnType<typeof vi.fn> }>,
    )) {
      if (delegate && typeof delegate.findMany === "function") {
        delegate.findMany.mockResolvedValue([]);
      }
    }
    prismaMock.prompt.findMany.mockResolvedValue([{ id: "p1" }]);
    await saveAutoBackupSettings(prismaMock as never, {
      enabled: true,
      targets: [
        {
          name: "dav1",
          url: "https://dav.example.com/b",
          username: "u",
          password: "p",
          enabled: true,
          intervalHours: 1,
          keep: 1,
        },
      ],
    });
    const puts: string[] = [];
    const deletes: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        puts.push(url);
        expect(init?.body as string).toContain("acs-backup");
        return new Response(null, { status: 201 });
      }
      if (method === "MKCOL") return new Response(null, { status: 201 });
      if (method === "DELETE") {
        deletes.push(url);
        return new Response(null, { status: 204 });
      }
      return new Response('<?xml version="1.0"?><d:multistatus/>', { status: 207 });
    }) as unknown as typeof fetch;

    const r = await runAutoBackup({ prisma: prismaMock as never, force: true, fetchImpl });
    expect(r.ran).toBe(true);
    expect(r.totalRows).toBeGreaterThan(0);
    expect(puts.length).toBe(1);
    // 立即再跑一次 → 产生第 2 份 → keep=1 触发清理第 1 份
    await runAutoBackup({ prisma: prismaMock as never, force: true, fetchImpl });
    expect(deletes.length).toBe(1);
    const status = await getAutoBackupStatus(prismaMock as never);
    expect(status.lastBackupStatus).toBe("ok");
  });

  it("未配置目标：force 抛中文错误", async () => {
    await expect(runAutoBackup({ prisma: prismaMock as never, force: true })).rejects.toThrow(
      /未配置启用的 WebDAV 目标/,
    );
  });
});
