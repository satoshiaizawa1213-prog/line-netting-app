type Recipient = { line_user_id: string }

/**
 * LINE Push Message API で複数ユーザーに通知する。
 * LINE_CHANNEL_ACCESS_TOKEN が未設定の場合は黙ってスキップ。
 * 通知失敗はメイン処理に影響させない。
 */
export async function pushLineMessages(
  recipients: Recipient[],
  message: string
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token || recipients.length === 0) return

  await Promise.allSettled(
    recipients.map((r) =>
      fetch('https://api.line.me/v2/bot/message/push', {
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
    )
  )
}
