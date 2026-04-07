import { IncomingMessage, ServerResponse } from 'http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify({ ok: true, url: req.url, method: req.method }))
}
