import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const q = async (label, sql) => {
  try { console.log(label + ": OK", JSON.stringify(await db.$queryRawUnsafe(sql))); }
  catch (err) { console.log(label + "_ERROR:", String(err).slice(0, 240)); }
};
await q("DROP_OLD", `DROP POLICY IF EXISTS notifications_insert ON public.notifications`);
await q("CREATE_INSERT", `CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid())`);
await q("VERIFY_POLICIES", `select policyname, cmd, with_check from pg_policies where schemaname='public' and tablename='notifications' order by policyname`);
await q("VERIFY_COLUMNS", `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='notifications' and column_name in ('post_id','comment_id','space_id','type','ref_id')`);
await db.$disconnect();
