import { handle } from 'hono/vercel'
import app from '../apps/api/src/app'

export const config = { runtime: 'nodejs20.x' }

export default handle(app)
