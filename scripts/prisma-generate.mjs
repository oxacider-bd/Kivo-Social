/**
 * Picks the right Prisma schema for `prisma generate`:
 *   - postgres://… DATABASE_URL  → prisma/schema.postgres.prisma (Vercel / Supabase)
 *   - anything else (or unset)   → prisma/schema.prisma (SQLite local dev)
 *
 * The two schemas share an identical data model — only the datasource differs —
 * so the generated client API is the same either way.
 *
 * IMPORTANT: this script must resolve DATABASE_URL the SAME way the Next.js
 * runtime does — including reading .env files (Next loads them automatically;
 * a plain node script does not). Without this, a postgres:// DATABASE_URL in
 * .env pairs with a SQLite-generated client at runtime and EVERY database
 * call fails ("the URL must start with the protocol `file:`").
 *
 * Runs via `postinstall` and before `next build` (see package.json).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Minimal .env loader — mirrors Next.js precedence: real env vars win. */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

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
  // Windows: npx is a .cmd shim — spawnSync needs a shell to resolve it.
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
