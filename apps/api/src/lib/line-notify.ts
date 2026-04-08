type Recipient = { line_user_id: string }

type PushResult = {
  line_user_id: string
  ok: boolean
  status?: number
  body?: unknown
}

/**
 * LINE Push Message API で複数ユーザーに通知する。
 * LINE_CHANNEL_ACCESS_TOKEN が未設定の場合はスキップ。
 * 結果（成否・エラー詳細）を返す。
 */
export async function pushLineMessages(
  recipients: Recipient[],
  message: string
): Promise<PushResult[]> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token || recipients.length === 0) return []

  const results = await Promise.allSettled(
    recipients.map(async (r): Promise<PushResult> => {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: r.line_user_id,
          messages: [{ type: 'text', text: message }],
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        console.error(`[LINE Push] Failed for ${r.line_user_id}: ${res.status}`, body)
      }
      return { line_user_id: r.line_user_id, ok: res.ok, status: res.status, body }
    })
  )

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { line_user_id: recipients[i].line_user_id, ok: false, body: String(r.reason) }
  )
}
