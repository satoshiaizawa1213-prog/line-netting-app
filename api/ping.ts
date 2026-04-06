export const config = { runtime: 'nodejs' }

export default function handler(req: Request): Response {
  return new Response(JSON.stringify({ pong: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
