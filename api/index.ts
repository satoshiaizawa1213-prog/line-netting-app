import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import app from '../apps/api/src/app'

export const config = { runtime: 'nodejs' }

// Vercel では /api/* → この関数に届くので /api プレフィックスを付けてマウント
const root = new Hono()
root.route('/api', app)

export default handle(root)
