import { IncomingMessage, ServerResponse } from 'http'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import app from '../apps/api/src/app'

const root = new Hono()
root.use('*', cors({ origin: '*' }))
root.get('/api/health', (c) => c.json({ ok: true }))
root.route('/api', app)

const listener = getRequestListener(root.fetch.bind(root))

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return listener(req, res)
}
