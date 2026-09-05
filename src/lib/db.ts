import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Query logging is a dev aid — production logs stay quiet.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Safe datasource description for diagnostics — derived from DATABASE_URL with
 * credentials stripped. Never contains passwords or full connection strings.
 */
export function describeDatasource() {
  const raw = (process.env.DATABASE_URL ?? '').trim()
  const info: {
    envPresent: boolean
    kind: 'postgres' | 'sqlite' | 'unknown'
    host: string | null
    database: string | null
    schema: string | null
  } = { envPresent: raw.length > 0, kind: 'unknown', host: null, database: null, schema: null }

  if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) {
    info.kind = 'postgres'
    try {
      const u = new URL(raw)
      info.host = u.host
      info.database = u.pathname.replace(/^\//, '') || null
      info.schema = u.searchParams.get('schema')
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
  const e = err as { code?: unknown; message?: unknown }
  const code = typeof e?.code === 'string' ? e.code : null
  const detail =
    typeof e?.message === 'string'
      ? e.message.split('\n').slice(0, 3).join(' ').replace(/:\/\/[^@\s]+@/g, '://***@').slice(0, 240)
      : null
  return { code, detail }
}