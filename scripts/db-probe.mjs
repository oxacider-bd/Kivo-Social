import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const r = await db.$queryRawUnsafe(`select count(*)::int as posts from kivo."Post"`);
  console.log("DB_OK:", JSON.stringify(r));
} catch (err) { console.log("DB_ERROR:", String(err).slice(0, 200)); }
await db.$disconnect();
