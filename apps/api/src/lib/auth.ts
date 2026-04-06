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

/** LINEアクセストークンを検証し、DBユーザーをupsertしてcontextにセット */
export const authMiddleware = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  // LINE プロフィールAPIでトークンを検証
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!profileRes.ok) return c.json({ error: 'Invalid LINE token' }, 401)

  const profile = await profileRes.json() as {
    userId: string
    displayName: string
    pictureUrl?: string
  }

  // DB に upsert
  const { data, error } = await db
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
    .single()

  if (error || !data) return c.json({ error: 'DB error' }, 500)

  c.set('user', data as AuthUser)
  await next()
})
