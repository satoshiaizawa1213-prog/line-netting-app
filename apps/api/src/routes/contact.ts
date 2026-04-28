import { Hono } from 'hono'
import { Resend } from 'resend'

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

  const apiKey = process.env.RESEND_API_KEY
  const toEmail = process.env.CONTACT_TO_EMAIL
  if (!apiKey || !toEmail) {
    console.error('[contact] RESEND_API_KEY or CONTACT_TO_EMAIL is not set')
    return c.json({ error: 'メール送信設定が未完了です。しばらくお待ちください。' }, 503)
  }

  const resend = new Resend(apiKey)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    replyTo: email.trim(),
    subject: `【すっきりワリカン】お問い合わせ: ${name.trim()}`,
    text: [
      `お名前: ${name.trim()}`,
      `メールアドレス: ${email.trim()}`,
      ``,
      `--- お問い合わせ内容 ---`,
      message.trim(),
      ``,
      `--- 送信情報 ---`,
      `送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
      `IP: ${ip}`,
    ].join('\n'),
  })

  if (error) {
    console.error('[contact] Resend error:', error)
    return c.json({ error: 'メールの送信に失敗しました。時間をおいてからお試しください。' }, 500)
  }

  return c.json({ ok: true })
})

export default contact
