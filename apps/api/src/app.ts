import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './lib/auth'
import { pushLineMessages } from './lib/line-notify'
import groups from './routes/groups'
import payments from './routes/payments'
import settlements from './routes/settlements'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: '*' })) // root の cors が先に処理するためワイルドカードで可

app.get('/health', (c) => c.json({ ok: true }))
app.post('/ping', (c) => c.json({ ok: true, ts: Date.now() }))

/** 現在ログイン中のユーザー情報を返す */
app.get('/me', authMiddleware, (c) => c.json(c.get('user')))
/** テスト用: POST + auth（DBなし） */
app.post('/me', authMiddleware, (c) => c.json(c.get('user')))

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

app.route('/groups',      groups)
app.route('/payments',    payments)
app.route('/settlements', settlements)

export default app
