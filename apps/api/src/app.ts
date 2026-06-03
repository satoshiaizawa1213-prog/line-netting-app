import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './lib/auth'
import { db } from './lib/db'
import { pushLineMessages } from './lib/line-notify'
import groups from './routes/groups'
import payments from './routes/payments'
import settlements from './routes/settlements'
import contact from './routes/contact'

const app = new Hono()

app.use('*', logger())

// CORS: 環境変数 CORS_ORIGINS（カンマ区切り）で許可オリジンを指定
// Vercel環境変数に例: https://liff.line.me,https://line-netting-app.vercel.app
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use('*', cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.get('/health', (c) => c.json({ ok: true }))
app.post('/ping', (c) => c.json({ ok: true, ts: Date.now() }))

/**
 * Vercel Cron 用キープアライブ
 * Supabase 無料プランは7日間アクセスがないと自動 Paused になるため、
 * 日次で軽い SELECT を打って DB を起こしておく。
 *
 * Vercel Cron は自動的に Authorization: Bearer <CRON_SECRET> を付与するので、
 * 環境変数 CRON_SECRET が設定されている場合はそれで保護する。
 */
app.get('/cron/keepalive', async (c) => {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = c.req.header('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  const started = Date.now()
  const { count, error } = await db
    .from('users')
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error('[keepalive] DB error:', error)
    return c.json({ ok: false, error: error.message }, 503)
  }

  return c.json({ ok: true, users_count: count, elapsed_ms: Date.now() - started })
})

/** 現在ログイン中のユーザー情報を返す */
app.get('/me', authMiddleware, (c) => c.json(c.get('user')))
/** テスト用: POST + auth（DBなし） */
app.post('/me', authMiddleware, (c) => c.json(c.get('user')))

// デバッグエンドポイント: 本番環境（NODE_ENV=production）では登録しない
if (process.env.NODE_ENV !== 'production') {
  /** LINE通知テスト: 自分自身にテストメッセージを送信して結果を返す */
  app.get('/debug/line-test', authMiddleware, async (c) => {
    const user = c.get('user')
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const liffUrl = process.env.LIFF_URL ?? ''

    if (!token) {
      return c.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' }, 500)
    }

    const results = await pushLineMessages(
      [{ line_user_id: user.line_user_id }],
      `🔔 LINE通知テスト\nuser_id: ${user.line_user_id}\n${liffUrl}`
    )

    return c.json({
      user: { id: user.id, line_user_id: user.line_user_id, display_name: user.display_name },
      token_prefix: token.slice(0, 8) + '...',
      results,
    })
  })
}

app.route('/groups',      groups)
app.route('/payments',    payments)
app.route('/settlements', settlements)
app.route('/contact',     contact)

export default app
