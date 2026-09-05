// Read-only pooler-region probe: attempts SELECT 1 against each candidate
// Supabase pooler endpoint using the credentials from DATABASE_URL in .env.
// Prints only PASS/FAIL per region — the password is never printed.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) { console.error("NO DATABASE_URL"); process.exit(2); }
const m = line.match(/postgresql:\/\/postgres:([^@]+)@/);
if (!m) { console.error("PARSE FAIL"); process.exit(2); }
const pw = m[1];
const ref = "ulhubxawckcrfsyrrqqp";

const regions = [
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
  "ap-northeast-2", "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "us-east-1", "us-east-2", "us-west-1", "sa-east-1",
];

for (const r of regions) {
  for (const tier of ["aws-0", "aws-1", "aws-2"]) {
    const url =
      `postgresql://postgres.${ref}:${pw}@${tier}-${r}.pooler.supabase.com:6543/postgres?schema=kivo&pgbouncer=true&connection_limit=1&connect_timeout=4`;
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      await client.$queryRawUnsafe("SELECT 1");
      console.log(`FOUND: ${tier}-${r}`);
      await client.$disconnect();
      process.exit(0);
    } catch (err) {
      await client.$disconnect().catch(() => {});
      const msg = String(err?.message ?? err).slice(0, 90).replace(/\S*pooler[^\s]*/g, "pooler");
      console.log(`no: ${tier}-${r} (${msg.includes("10.0.") ? "auth" : msg.split("\n")[0]})`);
    }
  }
}
console.log("NO_REGION_FOUND");
