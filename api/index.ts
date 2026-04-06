import { handle } from 'hono/vercel'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import app from '../apps/api/src/app'

const root = new Hono()
root.use('*', cors({ origin: '*' }))
root.get('/api/health', (c) => c.json({ ok: true }))
root.route('/api', app)

export default handle(root)
