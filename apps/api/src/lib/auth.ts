import { createMiddleware } from 'hono/factory'
import { db } from './db'

export type AuthUser = {
  id: string
  line_user_id: string
  display_name: string
  picture_url: string | null
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

// トークン → AuthUser のインメモリキャッシュ（同一インスタンス内5分有効）
const tokenCache = new Map<string, { user: AuthUser; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/** LINEアクセストークンを検証し、DBユーザーをupsertしてcontextにセット */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authMiddleware = createMiddleware<any>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  // キャッシュヒット確認（同一インスタンスへの連続リクエストで有効）
  const cached = tokenCache.get(token)
  if (cached && cached.expiresAt > Date.now()) {
    c.set('user', cached.user)
    await next()
    return
  }

  // LINE プロフィールAPIでトークンを検証（8秒タイムアウト）
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 8000)
  let profileRes: Response
  try {
    profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
  } catch {
    return c.json({ error: 'Auth timeout' }, 503)
  } finally {
    clearTimeout(t)
  }
  if (!profileRes.ok) return c.json({ error: 'Invalid LINE token' }, 401)

  const profile = await profileRes.json() as {
    userId: string
    displayName: string
    pictureUrl?: string
  }

  // DB に upsert（8秒タイムアウト）
  let data: AuthUser | null = null
  let dbError: unknown = null
  try {
    const result = await Promise.race([
      db
        .from('users')
        .upsert(
          {
            line_user_id: profile.userId,
            display_name: profile.displayName,
            picture_url: profile.pictureUrl ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'line_user_id' }
        )
        .select()
        .single(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB upsert timeout')), 8000)
      ),
    ])
    data = (result as { data: AuthUser | null; error: unknown }).data
    dbError = (result as { data: AuthUser | null; error: unknown }).error
  } catch (e) {
    return c.json({ error: `Auth DB timeout: ${(e as Error).message}` }, 503)
  }

  if (dbError || !data) return c.json({ error: 'DB error' }, 500)

  const user = data as AuthUser
  tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS })
  c.set('user', user)
  await next()
})
