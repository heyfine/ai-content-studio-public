import { createRequire } from "node:module";
import { NATURAL_WRITING_PROMPT_TEMPLATES } from "../src/lib/ai/prompt-content.ts";

const req = createRequire(import.meta.url);
const realClientPath = req.resolve(".prisma/client/default", { paths: [process.cwd()] });
const { PrismaClient } = req(realClientPath) as {
  PrismaClient: new () => {
    prompt: {
      findFirst: (args: {
        where: { type?: string; name?: string };
        orderBy?: { version?: "asc" | "desc" };
        select?: { version?: boolean };
      }) => Promise<{ id: string; content: string; version: number } | null>;
      create: (args: { data: unknown }) => Promise<unknown>;
      update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>;
    };
    $disconnect: () => Promise<void>;
  };
};

interface PromptTemplateSeed {
  type: string;
  name: string;
  description: string;
  content: string;
}

type PromptDb = {
  prompt: {
    findFirst: (args: {
      where: { type?: string; name?: string };
      orderBy?: { version?: "asc" | "desc" };
      select?: { version?: boolean };
    }) => Promise<{ id: string; content: string; version: number } | null>;
    create: (args: { data: unknown }) => Promise<unknown>;
    update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>;
  };
  $disconnect: () => Promise<void>;
};

/**
 * 幂等 upsert 一条 Prompt 模板。
 * - 已存在同名同类型：内容不变则仅确保 active；内容有变则更新并 version+1；
 * - 不存在：version 取该类型最大值 + 1，确保 getActivePromptByType（按 version desc 取首条）
 *   一定命中本模板，即使库里已有其他 active 的同类型模板。
 */
async function upsertPrompt(
  prisma: PromptDb,
  template: PromptTemplateSeed,
): Promise<"created" | "updated" | "active"> {
  const existing = await prisma.prompt.findFirst({
    where: { type: template.type, name: template.name },
  });
  if (existing) {
    if (existing.content !== template.content) {
      await prisma.prompt.update({
        where: { id: existing.id },
        data: {
          content: template.content,
          description: template.description,
          version: { increment: 1 },
          active: true,
        },
      });
      return "updated";
    }
    await prisma.prompt.update({ where: { id: existing.id }, data: { active: true } });
    return "active";
  }
  const latest = await prisma.prompt.findFirst({
    where: { type: template.type },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await prisma.prompt.create({
    data: {
      type: template.type,
      name: template.name,
      description: template.description,
      content: template.content,
      version: (latest?.version ?? 0) + 1,
      active: true,
    },
  });
  return "created";
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const template of NATURAL_WRITING_PROMPT_TEMPLATES) {
      const result = await upsertPrompt(prisma, template);
      console.log(`[${result}] ${template.type} / ${template.name} (version 已确保为该类型最高)`);
    }
    console.log(
      "去 AI 味 Prompt 模板已就绪：Studio「文章生成」自动走自然写作规范，「AI审核」走去 AI 味审校。",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
