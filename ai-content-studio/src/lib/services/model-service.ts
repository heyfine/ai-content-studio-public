import { prisma } from "@/lib/prisma";

export interface CreateModelInput {
  providerId: string;
  name: string;
  displayName: string;
  contextLength?: number;
  inputPrice?: number;
  outputPrice?: number;
  enabled?: boolean;
}

export async function listModels(providerId?: string) {
  if (providerId) {
    return prisma.aIModel.findMany({ where: { providerId }, include: { provider: true } });
  }
  return prisma.aIModel.findMany({ include: { provider: true } });
}

export async function createModel(input: CreateModelInput) {
  return prisma.aIModel.create({
    data: {
      providerId: input.providerId,
      name: input.name,
      displayName: input.displayName,
      contextLength: input.contextLength,
      inputPrice: input.inputPrice,
      outputPrice: input.outputPrice,
      enabled: input.enabled ?? true,
    },
  });
}

export type UpdateModelInput = Partial<
  Omit<CreateModelInput, "contextLength" | "inputPrice" | "outputPrice">
> & {
  contextLength?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
};

/** 更新模型：null 表示清空该字段，undefined 表示不更新 */
export async function updateModel(id: string, input: UpdateModelInput) {
  return prisma.aIModel.update({ where: { id }, data: input });
}

export async function deleteModel(id: string) {
  return prisma.aIModel.delete({ where: { id } });
}
