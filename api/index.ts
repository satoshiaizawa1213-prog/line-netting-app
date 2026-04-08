import { IncomingMessage, ServerResponse } from 'http'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import app from '../apps/api/src/app'

const ALLOWED_ORIGINS = [
  'https://line-netting-app.vercel.app',
  'https://liff.line.me',
]

const root = new Hono()
root.use('*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))
root.get('/api/health', (c) => c.json({ ok: true }))
root.route('/api', app)

const listener = getRequestListener(root.fetch.bind(root))

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return listener(req, res)
}
