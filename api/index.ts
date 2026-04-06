import { handle } from 'hono/vercel'
import { Hono } from 'hono'

export const config = { runtime: 'nodejs' }

const root = new Hono()
root.get('/api/health', (c) => c.json({ ok: true, stage: 'minimal' }))

export default handle(root)
