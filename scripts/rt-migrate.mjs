import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const q = async (label, sql) => {
  try { console.log(label + ": OK", JSON.stringify(await db.$queryRawUnsafe(sql))); }
  catch (err) { console.log(label + "_ERROR:", String(err).slice(0, 240)); }
};
await q("1_DROP_POST_FK", `ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_post_id_fkey`);
await q("2_DROP_COMMENT_FK", `ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_comment_id_fkey`);
await q("3_DROP_SPACE_FK", `ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_space_id_fkey`);
await q("4_POST_ID_TEXT", `ALTER TABLE public.notifications ALTER COLUMN post_id TYPE text USING post_id::text`);
await q("5_COMMENT_ID_TEXT", `ALTER TABLE public.notifications ALTER COLUMN comment_id TYPE text USING comment_id::text`);
await q("6_SPACE_ID_TEXT", `ALTER TABLE public.notifications ALTER COLUMN space_id TYPE text USING space_id::text`);
await q("7_ENUM_FOLLOW_ACCEPT", `ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'follow_accept'`);
await q("8_REF_ID", `ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ref_id text`);
await q("9_REF_INDEX", `CREATE INDEX IF NOT EXISTS idx_notifications_ref ON public.notifications (ref_id)`);
await q("10_INSERT_POLICY", `DROP POLICY IF EXISTS notifications_insert ON public.notifications; CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid())`);
await q("11_PUBLICATION_CHECK", `select pubname from pg_publication_tables where schemaname='public' and tablename='notifications'`);
await db.$disconnect();
