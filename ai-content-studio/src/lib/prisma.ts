import { PrismaClient } from ".prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  return new PrismaClient({ log: ["error", "warn"] });
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createPrisma();
  }
  return globalForPrisma.__prisma;
}

/** Lazy Prisma 客户端：模块加载时不实例化，仅首次属性访问时创建。规避 Next build page-data collection 阶段提前实例化导致 "did not initialize yet"。 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string) {
    const client = getPrisma();
    const value = Reflect.get(client, prop as keyof PrismaClient);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
}) as PrismaClient;
