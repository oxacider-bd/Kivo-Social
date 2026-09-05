import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const q = async (label, sql) => {
  try { console.log(label + ":", JSON.stringify(await db.$queryRawUnsafe(sql))); }
  catch (err) { console.log(label + "_ERROR:", String(err).slice(0, 200)); }
};
await q("ENUM_TYPE_OF_COLUMN", `select udt_name from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='type'`);
await q("ENUM_VALUES", `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=(select udt_name from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='type') order by enumsortorder`);
await q("DEFAULTS", `select column_name, column_default from information_schema.columns where table_schema='public' and table_name='notifications' order by ordinal_position`);
await q("PUBLICATION", `select p.pubname from pg_publication_tables t join pg_publication p on p.oid = t.puboid where t.schemaname='public' and t.tablename='notifications'`);
await q("INDEXES", `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='notifications'`);
await q("ROWCOUNT", `select count(*)::int as n from public.notifications`);
await db.$disconnect();
