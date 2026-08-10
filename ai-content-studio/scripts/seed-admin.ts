import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("请在 .env.local 中设置 ADMIN_EMAIL 与 ADMIN_PASSWORD");
  }
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: "ADMIN" },
      create: { email, passwordHash, role: "ADMIN" },
    });
    console.log(`管理员已就绪：${user.email}（${user.role}）`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
