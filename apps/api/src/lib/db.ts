import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _db: SupabaseClient | null = null

function getDb(): SupabaseClient {
  if (_db) return _db

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  _db = createClient(url, key, { auth: { persistSession: false } })
  return _db
}

// Proxy を使って既存コードの `db.from(...)` 等をそのまま使えるようにする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: SupabaseClient = new Proxy({} as any, {
  get(_target: unknown, prop: string | symbol) {
    const client = getDb()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
