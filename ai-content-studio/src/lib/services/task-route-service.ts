import { prisma } from "@/lib/prisma";

export async function listTaskRoutes() {
  return prisma.aITaskRoute.findMany({ include: { model: { include: { provider: true } } } });
}

export async function upsertTaskRoute(task: string, modelId: string) {
  return prisma.aITaskRoute.upsert({
    where: { task },
    update: { modelId },
    create: { task, modelId },
  });
}

function findRouteable() {
  return prisma.aIModel.findMany({
    where: { enabled: true },
    include: { provider: true },
  });
}

type RouteableModel = Awaited<ReturnType<typeof findRouteable>>[number];

function toRouteOption(m: RouteableModel) {
  return {
    id: m.id,
    label: `${m.provider.name} · ${m.displayName} (${m.name})`,
  };
}

export async function listRouteableModels() {
  const rows = await findRouteable();
  return rows
    .filter((m: RouteableModel) => m.provider.enabled)
    .map((m: RouteableModel) => toRouteOption(m));
}
