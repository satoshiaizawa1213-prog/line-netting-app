export default function handler(_req: Request): Response {
  return new Response(JSON.stringify({ pong: true, node: process.version }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
