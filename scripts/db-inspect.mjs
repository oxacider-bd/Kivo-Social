import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const sessions = await db.session.findMany({ include: { user: { select: { email: true } } }, orderBy: { createdAt: "desc" } });
  for (const s of sessions) {
    console.log(`session: user=${s.user?.email ?? "?"} created=${s.createdAt?.toISOString() ?? "n/a"} expires=${s.expiresAt.toISOString()}`);
  }
  console.log("TOTAL:", sessions.length);
} catch (err) {
  console.log("ERR:", String(err).slice(0, 400));
}
await db.$disconnect();
