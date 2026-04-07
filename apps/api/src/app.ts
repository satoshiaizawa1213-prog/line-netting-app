import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './lib/auth'
import groups from './routes/groups'
import payments from './routes/payments'
import settlements from './routes/settlements'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: '*' }))

app.get('/health', (c) => c.json({ ok: true }))
app.post('/ping', (c) => c.json({ ok: true, ts: Date.now() }))

/** 現在ログイン中のユーザー情報を返す */
app.get('/me', authMiddleware, (c) => c.json(c.get('user')))

app.route('/groups',      groups)
app.route('/payments',    payments)
app.route('/settlements', settlements)

export default app
