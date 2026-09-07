/**
 * 一次性迁移脚本：Supabase PostgreSQL → 本地 PostgreSQL。
 *
 * 用法：
 *   DATABASE_URL_SRC=<旧 Supabase 连接串> DATABASE_URL_DST=<本地连接串> \
 *     node --experimental-transform-types --env-file=<env文件> scripts/migrate-supabase-to-local.mts
 *
 * 按外键安全顺序复制全部模型（createMany skipDuplicates，重复 id 跳过），
 * Json 字段做纯 JSON 往返保证 Prisma InputJsonValue 兼容。
 */
import { createRequire } from "node:module";

const SRC = process.env.DATABASE_URL_SRC;
const DST = process.env.DATABASE_URL_DST;
if (!SRC || !DST) {
  console.error("请设置 DATABASE_URL_SRC 与 DATABASE_URL_DST");
  process.exit(1);
}

const req = createRequire(import.meta.url);
const { PrismaClient } = req(`${process.cwd()}/node_modules/.prisma/client`);

const src = new PrismaClient({ datasources: { db: { url: SRC } } });
const dst = new PrismaClient({ datasources: { db: { url: DST } } });

/** 外键安全顺序：先主表后从表 */
const MODELS = [
  "user",
  "aIProvider",
  "aIModel",
  "aITaskRoute",
  "prompt",
  "wordPressConfig",
  "weChatConfig",
  "relayApiKey",
  "workflowRun",
  "source",
  "sourceVersion",
  "article",
  "articleVersion",
  "articlePublish",
  "seoReport",
  "aIGeneration",
] as const;

function toPlain(value: unknown): unknown {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

async function main() {
  for (const model of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcModel = (src as any)[model];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dstModel = (dst as any)[model];
    const rows = await srcModel.findMany();
    if (rows.length === 0) {
      console.log(`- ${model}: 0 条，跳过`);
      continue;
    }
    const data = rows.map((r: Record<string, unknown>) => {
      const clean = { ...r };
      for (const [k, v] of Object.entries(clean)) {
        if (v !== null && typeof v === "object") clean[k] = toPlain(v);
      }
      return clean;
    });
    const result = await dstModel.createMany({ data, skipDuplicates: true });
    console.log(`- ${model}: ${rows.length} 条 → 写入 ${result.count}`);
  }
  console.log("迁移完成");
}

main()
  .catch((e) => {
    console.error("迁移失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await src.$disconnect();
    await dst.$disconnect();
  });
