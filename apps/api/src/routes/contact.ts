import { Hono } from 'hono'
import { pushLineMessages } from '../lib/line-notify'

const contact = new Hono()

// スパム対策: IPごとに1時間10件まで
const rateMap = new Map<string, { count: number; resetAt: number }>()
function checkContactRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

contact.post('/', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkContactRate(ip)) {
    return c.json({ error: '送信回数の上限に達しました。時間をおいてからお試しください。' }, 429)
  }

  // ※ logger() ミドルウェアが URL を出力するため、機微情報（氏名・メール・本文）が
  //   Vercel ログに残らないよう、ここでは追加ログを最小化する。
  //   ※ Vercel側のリクエストログには URL のクエリパラメータが残ってしまうため、
  //   将来的に POST body 化を検討（hono/node-server の body 読取問題が解消後）。

  // 他のルートと同じくクエリパラメーターで受け取る
  const name      = c.req.query('name')
  const email     = c.req.query('email')
  const message   = c.req.query('message')
  const _honeypot = c.req.query('_honeypot')

  // ハニーポット: ボットは隠しフィールドを埋める
  if (_honeypot) return c.json({ ok: true }) // サイレント無視

  // バリデーション
  if (!name?.trim() || name.trim().length > 100) {
    return c.json({ error: 'お名前を入力してください（100文字以内）。' }, 400)
  }
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return c.json({ error: '有効なメールアドレスを入力してください。' }, 400)
  }
  if (email.trim().length > 200) {
    return c.json({ error: 'メールアドレスが長すぎます。' }, 400)
  }
  if (!message?.trim() || message.trim().length < 10) {
    return c.json({ error: 'お問い合わせ内容を10文字以上入力してください。' }, 400)
  }
  if (message.trim().length > 2000) {
    return c.json({ error: 'お問い合わせ内容は2000文字以内で入力してください。' }, 400)
  }

  const ownerLineUserId = process.env.OWNER_LINE_USER_ID
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN

  if (!ownerLineUserId || !lineToken) {
    console.error('[contact] env vars missing:', { owner: !!ownerLineUserId, token: !!lineToken })
    return c.json({ error: '通知設定が未完了です。しばらくお待ちください。' }, 503)
  }

  const lineMessage = [
    '📬 お問い合わせが届きました',
    '',
    `👤 お名前: ${name.trim()}`,
    `📧 メール: ${email.trim()}`,
    '',
    '💬 内容:',
    message.trim(),
  ].join('\n')

  // 8秒タイムアウト付きで LINE API を呼ぶ
  let results
  try {
    results = await Promise.race([
      pushLineMessages([{ line_user_id: ownerLineUserId }], lineMessage),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LINE API timeout after 8s')), 8000)
      ),
    ])
  } catch (e) {
    console.error('[contact] LINE push error:', e)
    return c.json({ error: 'LINE通知の送信に失敗しました。時間をおいてからお試しください。' }, 500)
  }

  if (!results[0]?.ok) {
    console.error('[contact] LINE push failed: status=', results[0]?.status)
    return c.json({ error: 'LINE通知の送信に失敗しました。時間をおいてからお試しください。' }, 500)
  }

  return c.json({ ok: true })
})

export default contact
