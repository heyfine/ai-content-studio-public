import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { encrypt } from "../src/lib/crypto.ts";

const req = createRequire(import.meta.url);
const realClientPath = req.resolve(".prisma/client/default", { paths: [process.cwd()] });
const { PrismaClient } = req(realClientPath) as {
  PrismaClient: new () => {
    relayApiKey: {
      create: (args: {
        data: { name: string; key: string; keyPrefix: string };
      }) => Promise<{ id: string }>;
      deleteMany: (args: { where: { name?: string } }) => Promise<{ count: number }>;
    };
    $disconnect: () => Promise<void>;
  };
};

const RELAY_KEY_PREFIX = "sk-relay-";
const KEY_PREFIX_LEN = 12;

async function main() {
  const name = process.env.RELAY_KEY_NAME ?? "冒烟测试";
  const prisma = new PrismaClient();
  try {
    // 清掉同名旧 key，避免重复
    await prisma.relayApiKey.deleteMany({ where: { name } });
    const secret = RELAY_KEY_PREFIX + randomBytes(24).toString("hex");
    const keyPrefix = secret.slice(0, KEY_PREFIX_LEN);
    const row = await prisma.relayApiKey.create({
      data: { name, key: encrypt(secret), keyPrefix },
    });
    console.log(`已创建中转密钥：name=${name} id=${row.id}`);
    console.log(`明文（仅此一次，请妥善保存）：`);
    console.log(secret);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
