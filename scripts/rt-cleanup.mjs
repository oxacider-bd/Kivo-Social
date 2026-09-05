import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
await db.$executeRawUnsafe(`DELETE FROM public.notifications WHERE message = 'diag insert (rolled back)'`);
console.log("CLEANED:", JSON.stringify(await db.$queryRawUnsafe(`select count(*)::int as n from public.notifications`)));
await db.$disconnect();
