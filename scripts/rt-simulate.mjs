import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const user = await db.user.findUnique({ where: { email: "imdshihab618@gmail.com" }, select: { supabaseId: true } });
if (!user?.supabaseId) { console.log("NO_SUPABASE_ID"); process.exit(1); }
const uid = user.supabaseId;
console.log("simulating actor insert for", uid.slice(0, 8) + "...");
try {
  await db.$transaction([
    db.$executeRawUnsafe(`SET LOCAL ROLE authenticated`),
    db.$executeRawUnsafe(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" }).replace(/'/g, "''")}'`),
    db.$executeRawUnsafe(`INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, message) VALUES ('${uid}'::uuid, '${uid}'::uuid, 'follow', 'cmtnrdlvn0024ve1s8j7gfsv2', 'diag insert (rolled back)')`),
  ]);
  console.log("INSERT_AS_ACTOR: OK (policy accepted + text post_id accepted)");
} catch (err) {
  console.log("INSERT_AS_ACTOR_ERROR:", String(err).slice(0, 300));
}
// forged insert must FAIL: actor_id != auth.uid()
try {
  await db.$transaction([
    db.$executeRawUnsafe(`SET LOCAL ROLE authenticated`),
    db.$executeRawUnsafe(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" }).replace(/'/g, "''")}'`),
    db.$executeRawUnsafe(`INSERT INTO public.notifications (recipient_id, actor_id, type, message) VALUES ('${uid}'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'follow', 'forged')`),
  ]);
  console.log("FORGED_INSERT: UNEXPECTEDLY ACCEPTED (policy too loose!)");
} catch (err) {
  console.log("FORGED_INSERT_REJECTED: OK (RLS works)");
}
const count = await db.$queryRawUnsafe(`select count(*)::int as n from public.notifications`);
console.log("ROWCOUNT_AFTER (should be 0 - rolled back):", JSON.stringify(count));
await db.$disconnect();
