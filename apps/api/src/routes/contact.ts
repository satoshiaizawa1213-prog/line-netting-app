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

  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: 'リクエスト形式が不正です。' }, 400)

  const { name, email, message, _honeypot } = body as {
    name?: string
    email?: string
    message?: string
    _honeypot?: string
  }

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
  console.log('[contact] OWNER_LINE_USER_ID set:', !!ownerLineUserId)
  console.log('[contact] LINE_CHANNEL_ACCESS_TOKEN set:', !!lineToken)

  if (!ownerLineUserId) {
    console.error('[contact] OWNER_LINE_USER_ID is not set')
    return c.json({ error: '通知設定が未完了です。しばらくお待ちください。' }, 503)
  }
  if (!lineToken) {
    console.error('[contact] LINE_CHANNEL_ACCESS_TOKEN is not set')
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

  console.log('[contact] Sending LINE push to:', ownerLineUserId.slice(0, 5) + '...')

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

  console.log('[contact] LINE push result:', JSON.stringify(results[0]))

  if (!results[0]?.ok) {
    console.error('[contact] LINE push failed:', results[0])
    return c.json({ error: 'LINE通知の送信に失敗しました。時間をおいてからお試しください。' }, 500)
  }

  return c.json({ ok: true })
})

export default contact
