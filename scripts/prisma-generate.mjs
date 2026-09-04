/**
 * Picks the right Prisma schema for `prisma generate`:
 *   - postgres://… DATABASE_URL  → prisma/schema.postgres.prisma (Vercel / Supabase)
 *   - anything else (or unset)   → prisma/schema.prisma (SQLite local dev)
 *
 * The two schemas share an identical data model — only the datasource differs —
 * so the generated client API is the same either way.
 *
 * Runs via `postinstall` and before `next build` (see package.json).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const url = (process.env.DATABASE_URL ?? "").trim();
const schema =
  url.startsWith("postgres://") || url.startsWith("postgresql://")
    ? "prisma/schema.postgres.prisma"
    : "prisma/schema.prisma";

if (!existsSync(schema)) {
  console.error(`[prisma-generate] schema not found: ${schema}`);
  process.exit(1);
}

console.log(`[prisma-generate] using ${schema}`);

const result = spawnSync("npx", ["--yes", "prisma", "generate", "--schema", schema], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
