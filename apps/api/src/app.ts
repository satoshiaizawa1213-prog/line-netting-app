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

// /contact のクエリパラメータには PII（氏名・メール・本文）が含まれるため
// ログに残さないようカスタムロガーを使う
app.use('*', logger((message: string, ...rest: string[]) => {
  const masked = message.replace(
    /(\/api)?\/contact\?[^\s]+/g,
    (m) => m.split('?')[0] + '?[REDACTED]'
  )
  console.log(masked, ...rest)
}))

// CORS: 環境変数 CORS_ORIGINS（カンマ区切り）で許可オリジンを指定
// Vercel環境変数に例: https://liff.line.me,https://line-netting-app.vercel.app
// 本番でenv vars 未設定の事故を避けるため、production では localhost にフォールバックしない
const isProd = process.env.NODE_ENV === 'production'
const defaultOrigins = isProd ? '' : 'http://localhost:5173'
const allowedOrigins = (process.env.CORS_ORIGINS ?? defaultOrigins)
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
  // CRON_SECRET は必須（未設定なら拒否してアプリ規模等の情報漏洩を防ぐ）
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[keepalive] CRON_SECRET is not set')
    return c.json({ error: 'Not configured' }, 503)
  }
  const auth = c.req.header('authorization') ?? ''
  if (auth !== `Bearer ${cronSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // 軽量SELECT（head: true で行データは取得しない）
  const { error } = await db
    .from('users')
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error('[keepalive] DB error:', error.message)
    return c.json({ ok: false }, 503)
  }

  // 件数等の機密情報は返さない
  return c.json({ ok: true })
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
