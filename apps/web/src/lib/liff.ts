import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string

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
}

export function getAccessToken(): string {
  const token = liff.getAccessToken()
  if (!token) throw new Error('No LIFF access token')
  return token
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
