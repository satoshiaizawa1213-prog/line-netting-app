import { handle } from 'hono/vercel'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import app from '../apps/api/src/app'

export const config = { runtime: 'nodejs' }

const root = new Hono()
root.use('*', cors({ origin: '*' }))

// 診断用：単純なヘルスチェック（DB不使用）
root.get('/api/health', (c) =>
  c.json({
    ok: true,
    supabase_url_set: !!process.env.SUPABASE_URL,
    service_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
)

// 通常のアプリルーティング
root.route('/api', app)

export default handle(root)
