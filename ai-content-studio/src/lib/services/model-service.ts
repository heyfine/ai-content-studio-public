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
  return prisma.aIModel.findMany(
    providerId
      ? { where: { providerId }, include: { provider: true } }
      : { include: { provider: true } },
  );
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

export async function updateModel(id: string, input: Partial<CreateModelInput>) {
  return prisma.aIModel.update({ where: { id }, data: input });
}

export async function deleteModel(id: string) {
  return prisma.aIModel.delete({ where: { id } });
}
