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
        upsert: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  BACKUP_DOMAINS,
  createBackup,
  FK_PRECHECK,
  RESTORE_ORDER,
  resolveDomains,
  restoreBackup,
  validateBackup,
} from "./backup-service";

describe("RESTORE_ORDER 与外键依赖", () => {
  it("每条跨域外键的父表都必须排在子表之前（还原顺序回归）", () => {
    for (const { child, parent } of FK_PRECHECK) {
      // 失败时 diff 显示两个下标，对照 FK_PRECHECK 定位违规的依赖对
      expect(RESTORE_ORDER.indexOf(parent)).toBeLessThan(RESTORE_ORDER.indexOf(child));
    }
  });
});

describe("resolveDomains", () => {
  it("full=true 展开为全部域", () => {
    const r = resolveDomains({ full: true });
    expect(r.full).toBe(true);
    expect(r.domains).toEqual(BACKUP_DOMAINS.map((d) => d.key));
  });

  it("空选择抛错；未知域抛错；去重", () => {
    expect(() => resolveDomains({ domains: [] })).toThrow(/至少勾选/);
    expect(() => resolveDomains({ domains: ["nope"] })).toThrow(/未知/);
    expect(resolveDomains({ domains: ["articles", "articles", "prompts"] }).domains).toEqual([
      "articles",
      "prompts",
    ]);
  });
});

describe("validateBackup", () => {
  const valid = {
    format: "acs-backup",
    formatVersion: 1,
    exportedAt: "2026-09-07T00:00:00Z",
    full: false,
    domains: ["prompts"],
    data: { Prompt: [{ id: "p1" }] },
  };

  it("合法文件通过；非本系统格式/未知表/非法行分别报错", () => {
    expect(() => validateBackup(valid)).not.toThrow();
    expect(() => validateBackup({ ...valid, format: "other" })).toThrow(/不是本系统/);
    expect(() => validateBackup({ ...valid, data: { Hack: [] } })).toThrow(/未知数据表/);
    expect(() => validateBackup({ ...valid, data: { Prompt: ["x"] } })).toThrow(/非法行/);
    expect(() => validateBackup(null)).toThrow();
  });
});

describe("createBackup / restoreBackup", () => {
  beforeEach(() => {
    for (const d of Object.values(prismaMock)) {
      if (d && typeof d === "object") {
        for (const fn of Object.values(d as Record<string, unknown>)) {
          if (typeof fn === "function" && "mockReset" in fn) {
            (fn as unknown as { mockReset: () => void }).mockReset();
          }
        }
      }
    }
  });

  it("备份：按域导出各表并统计行数", async () => {
    prismaMock.prompt.findMany.mockResolvedValue([{ id: "p1", content: "hi" }]);
    prismaMock.article.findMany.mockResolvedValue([]);
    const r = await createBackup(prismaMock as never, { domains: ["prompts"] });
    expect(r.totalRows).toBe(1);
    expect(r.backup.data.Prompt).toEqual([{ id: "p1", content: "hi" }]);
    expect(r.backup.format).toBe("acs-backup");
  });

  it("merge 还原：逐行按 id upsert", async () => {
    prismaMock.prompt.upsert.mockResolvedValue({});
    const backup = {
      format: "acs-backup",
      formatVersion: 1,
      exportedAt: "x",
      full: false,
      domains: ["prompts"],
      data: { Prompt: [{ id: "p1", content: "hi" }] },
    };
    const r = await restoreBackup(prismaMock as never, backup, "merge");
    expect(r.restored).toBe(true);
    expect(r.totalRows).toBe(1);
    expect(prismaMock.prompt.upsert).toHaveBeenCalledWith({
      where: { id: "p1" },
      update: { id: "p1", content: "hi" },
      create: { id: "p1", content: "hi" },
    });
  });

  it("overwrite 还原：事务内反向清空后 createMany", async () => {
    prismaMock.prompt.deleteMany.mockResolvedValue({});
    prismaMock.prompt.createMany.mockResolvedValue({});
    // 交互事务 mock：回调收到 prismaMock 自身（tx 与主 client 具有相同 delegate）
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => await fn(prismaMock),
    );
    const backup = {
      format: "acs-backup",
      formatVersion: 1,
      exportedAt: "x",
      full: false,
      domains: ["prompts"],
      data: { Prompt: [{ id: "p1", content: "hi" }] },
    };
    const r = await restoreBackup(prismaMock as never, backup, "overwrite");
    expect(r.totalRows).toBe(1);
    expect(prismaMock.prompt.deleteMany).toHaveBeenCalled();
    expect(prismaMock.prompt.createMany).toHaveBeenCalledWith({
      data: [{ id: "p1", content: "hi" }],
    });
  });

  it("merge 缺 id 的行给出中文错误", async () => {
    const backup = {
      format: "acs-backup",
      formatVersion: 1,
      exportedAt: "x",
      full: false,
      domains: ["prompts"],
      data: { Prompt: [{ content: "no-id" }] },
    };
    await expect(restoreBackup(prismaMock as never, backup, "merge")).rejects.toThrow(/缺少 id/);
  });

  it("预检：文章引用的 WordPressConfig 不在备份中 → 中文报错且不触发写入", async () => {
    const backup = {
      format: "acs-backup",
      formatVersion: 1,
      exportedAt: "x",
      full: false,
      domains: ["articles"],
      data: { Article: [{ id: "a1", siteConfigId: "w1" }] },
    };
    await expect(restoreBackup(prismaMock as never, backup, "merge")).rejects.toThrow(
      /备份不完整.*发布配置/,
    );
    expect(prismaMock.article.upsert).not.toHaveBeenCalled();
    // overwrite 模式同样先预检，不清空任何表
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => await fn(prismaMock),
    );
    await expect(restoreBackup(prismaMock as never, backup, "overwrite")).rejects.toThrow(
      /备份不完整/,
    );
    expect(prismaMock.article.deleteMany).not.toHaveBeenCalled();
  });

  it("预检：子表行无该字段或字段为空 → 不拦截（可空外键合法）", async () => {
    prismaMock.article.upsert.mockResolvedValue({});
    const backup = {
      format: "acs-backup",
      formatVersion: 1,
      exportedAt: "x",
      full: false,
      domains: ["articles"],
      data: { Article: [{ id: "a1", siteConfigId: null }, { id: "a2" }] },
    };
    const r = await restoreBackup(prismaMock as never, backup, "merge");
    expect(r.totalRows).toBe(2);
  });
});
