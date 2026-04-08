import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string

// initLiff() 直後に取得したトークンをキャッシュ
// liff.getAccessToken() は状況によって後から null を返すことがあるため
let _cachedToken: string | null = null

export async function initLiff(): Promise<void> {
  try {
    await liff.init({ liffId: LIFF_ID })
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
  const inChat = ctx?.type === 'group' || ctx?.type === 'room' || ctx?.type === 'utou'

  // グループ/トークから開かれている場合はそのチャットに直接送信
  if (inChat && liff.isApiAvailable('sendMessages')) {
    try {
      await liff.sendMessages([{ type: 'text', text }])
      return { status: 'sent' }
    } catch (e) {
      return { status: 'error', message: String(e) }
    }
  }

  // それ以外は shareTargetPicker で送信先を選択
  if (!liff.isApiAvailable('shareTargetPicker')) {
    return {
      status: 'unavailable',
      message: 'グループトークからアプリを開くか、LINE Developers Console で「Share target picker」を ON にしてください。',
    }
  }
  try {
    const result = await liff.shareTargetPicker([{ type: 'text', text }], { isMultiple: false })
    return { status: result?.status === 'success' ? 'sent' : 'cancelled' }
  } catch (e) {
    return { status: 'error', message: String(e) }
  }
}
