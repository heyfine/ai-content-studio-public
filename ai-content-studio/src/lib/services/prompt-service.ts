import { prisma } from "@/lib/prisma";

export interface CreatePromptInput {
  name: string;
  description?: string;
  type: string;
  content: string;
  active?: boolean;
}

export type UpdatePromptInput = Partial<CreatePromptInput>;

export async function listPrompts(type?: string) {
  return prisma.prompt.findMany(
    type ? { where: { type }, orderBy: { updatedAt: "desc" } } : { orderBy: { updatedAt: "desc" } },
  );
}

export async function getPrompt(id: string) {
  return prisma.prompt.findUnique({ where: { id } });
}

export async function createPrompt(input: CreatePromptInput) {
  return prisma.prompt.create({
    data: {
      name: input.name,
      description: input.description || null,
      type: input.type,
      content: input.content,
      active: input.active ?? true,
    },
  });
}

/** 更新：content 变更时 version 自增，其余字段按需写入 */
export async function updatePrompt(id: string, input: UpdatePromptInput) {
  const existing = await prisma.prompt.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Prompt 不存在");
  }
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.type !== undefined) data.type = input.type;
  if (input.content !== undefined) {
    data.content = input.content;
    if (input.content !== existing.content) {
      data.version = existing.version + 1;
    }
  }
  if (input.active !== undefined) data.active = input.active;
  return prisma.prompt.update({ where: { id }, data });
}

export async function deletePrompt(id: string) {
  return prisma.prompt.delete({ where: { id } });
}

/** generate 流程注入：返回某类型下 active=true 的最新 Prompt */
export async function getActivePromptByType(type: string) {
  return prisma.prompt.findFirst({
    where: { type, active: true },
    orderBy: { version: "desc" },
  });
}
