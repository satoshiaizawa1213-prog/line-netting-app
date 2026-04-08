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
 * shareTargetPicker でメッセージを LINE チャット/グループに共有する。
 * 友だち追加不要でどのトークルームにも送れる。
 * 戻り値: 'sent' | 'cancelled' | 'unavailable'
 */
export async function shareToLine(text: string): Promise<'sent' | 'cancelled' | 'unavailable'> {
  if (!liff.isApiAvailable('shareTargetPicker')) return 'unavailable'
  try {
    const result = await liff.shareTargetPicker([{ type: 'text', text }], { isMultiple: false })
    return result?.status === 'success' ? 'sent' : 'cancelled'
  } catch {
    return 'cancelled'
  }
}
