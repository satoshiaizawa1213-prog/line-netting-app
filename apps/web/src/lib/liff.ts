import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string

// initLiff() 直後に取得したトークンをキャッシュ
// liff.getAccessToken() は状況によって後から null を返すことがあるため
let _cachedToken: string | null = null

export async function initLiff(): Promise<void> {
  try {
    await Promise.race([
      liff.init({ liffId: LIFF_ID }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LIFF初期化がタイムアウトしました（10秒）')), 10_000)
      ),
    ])
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    throw new Error(`liff.init failed: code=${err?.code} msg=${err?.message} liffId=${LIFF_ID}`)
  }

  if (!liff.isLoggedIn()) {
    liff.login()
    // login() はリダイレクトするため Promise を resolve させない
    await new Promise<never>(() => {})
  }

  _cachedToken = liff.getAccessToken()
  if (!_cachedToken) throw new Error('LIFF access token unavailable after login')
}

export function getAccessToken(): string {
  if (!_cachedToken) throw new Error('No LIFF access token')
  return _cachedToken
}

export function getLineProfile() {
  return liff.getProfile()
}

export function getGroupContext() {
  const ctx = liff.getContext()
  console.log('[LIFF] context:', JSON.stringify(ctx))
  if (ctx?.type !== 'group') return null
  return { groupId: ctx.groupId! }
}

export function closeWindow() {
  liff.closeWindow()
}

export async function shareSettlementResult(text: string): Promise<boolean> {
  try {
    await liff.sendMessages([{ type: 'text', text }])
    return true
  } catch {
    return false
  }
}

/**
 * LINE にメッセージを送信する。
 *
 * 優先順位:
 *   1. グループ/トークルームから開かれている場合 → sendMessages() でそのチャットに直送
 *   2. それ以外 → shareTargetPicker() で送信先を選択
 *
 * 戻り値:
 *   'sent'        - 送信完了
 *   'cancelled'   - ユーザーがキャンセル（picker のみ）
 *   'unavailable' - 送信手段がない
 *   'error'       - 予期せぬエラー
 */
export async function shareToLine(
  text: string
): Promise<{ status: 'sent' | 'cancelled' | 'unavailable' | 'error'; message?: string }> {
  const ctx = liff.getContext()
  const ctxType = ctx?.type ?? 'none'
  const inChat = ctxType === 'group' || ctxType === 'room' || ctxType === 'utou'

  // グループ/トークから開かれている場合はそのチャットに直接送信
  // (sendMessages はコンテキストで判断。isApiAvailable は非対応)
  if (inChat) {
    try {
      await liff.sendMessages([{ type: 'text', text }])
      return { status: 'sent' }
    } catch (e) {
      return { status: 'error', message: `sendMessages失敗(ctx=${ctxType}): ${String(e)}` }
    }
  }

  // それ以外は shareTargetPicker で送信先を選択
  if (!liff.isApiAvailable('shareTargetPicker')) {
    return {
      status: 'unavailable',
      message: `ctx=${ctxType}。グループトークのリンクからアプリを開くか、LINE Developers で「Share target picker」を ON にしてください。`,
    }
  }
  try {
    const result = await liff.shareTargetPicker([{ type: 'text', text }], { isMultiple: false })
    return { status: result?.status === 'success' ? 'sent' : 'cancelled' }
  } catch (e) {
    return { status: 'error', message: `shareTargetPicker失敗: ${String(e)}` }
  }
}
