import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Ensures the connection URL is PgBouncer-safe. Prisma uses named prepared
 * statements unless `pgbouncer=true` is set — through Supabase's transaction
 * pooler (port 6543) those collide across server connections and fail with
 * 42P05 "prepared statement \"s0\" already exists". The flag is applied
 * programmatically so a Vercel env string missing it cannot break the data
 * layer. Non-pooler URLs (local SQLite, direct connections) pass through.
 */
function resolveDatabaseUrl(raw: string): string {
  if (!raw.startsWith('postgres://') && !raw.startsWith('postgresql://')) return raw
  try {
    const u = new URL(raw)
    const isTransactionPooler =
      u.hostname.endsWith('.pooler.supabase.com') && u.port === '6543'
    if (!isTransactionPooler || u.searchParams.get('pgbouncer') === 'true') return raw
    u.searchParams.set('pgbouncer', 'true')
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1')
    return u.toString()
  } catch {
    return raw
  }
}

const resolvedUrl = resolveDatabaseUrl((process.env.DATABASE_URL ?? '').trim())

// Query logging is a dev aid — production logs stay quiet.
//
// IMPORTANT: the client is cached in EVERY environment (including production).
// Creating a new PrismaClient per request opens a fresh connection pool per
// request; on serverless (Vercel) instances are frozen without $disconnect(),
// so those connections leak on the transaction pooler until it starts
// refusing clients — every database route then fails instantly. One client
// per instance keeps the connection count bounded (instances × connection_limit).
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolvedUrl || undefined,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'query'],
  })

globalForPrisma.prisma = db

/**
 * Safe datasource description for diagnostics — derived from the RESOLVED
 * DATABASE_URL with credentials stripped. Never contains passwords or full
 * connection strings.
 */
export function describeDatasource() {
  const raw = resolvedUrl
  const info: {
    envPresent: boolean
    kind: 'postgres' | 'sqlite' | 'unknown'
    host: string | null
    database: string | null
    schema: string | null
    pgbouncer: boolean
  } = {
    envPresent: raw.length > 0,
    kind: 'unknown',
    host: null,
    database: null,
    schema: null,
    pgbouncer: false,
  }

  if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) {
    info.kind = 'postgres'
    try {
      const u = new URL(raw)
      info.host = u.host
      info.database = u.pathname.replace(/^\//, '') || null
      info.schema = u.searchParams.get('schema')
      info.pgbouncer = u.searchParams.get('pgbouncer') === 'true'
    } catch {
      /* unparsable — reported as-is by the health check */
    }
  } else if (raw.startsWith('file:')) {
    info.kind = 'sqlite'
  }
  return info
}

/** Scrubs credentials out of a Prisma error message before surfacing it. */
export function scrubDbError(err: unknown): { code: string | null; detail: string | null } {
  const e = err as { code?: unknown; message?: unknown; name?: unknown }
  const code = typeof e?.code === 'string' ? e.code : null
  const raw = typeof e?.message === 'string' && e.message.length > 0 ? e.message : String(err)
  const detail = raw
    .replace(/:\/\/[^@\s]+@/g, '://***@')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^(at |node_modules|prisma:)/i.test(l))
    .slice(0, 6)
    .join(' | ')
    .slice(0, 500)
  const name = typeof e?.name === 'string' ? e.name : null
  return { code: code ?? name, detail }
  return { code, detail }
}