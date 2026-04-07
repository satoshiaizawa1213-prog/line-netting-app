import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initLiff, getGroupContext, getAccessToken } from './lib/liff'
import { ensureGroup, getMe } from './lib/api'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

const root = document.getElementById('root')!

function showLoading() {
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;gap:12px;">
      <div style="width:36px;height:36px;border:4px solid #e0e0e0;border-top-color:#06C755;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <p style="color:#666;font-size:0.9rem;">読み込み中...</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `
}

function showError(message: string) {
  root.innerHTML = `
    <p style="padding:24px;color:#E53935;text-align:center;font-size:0.95rem;">${message}</p>
  `
}

function showGroupSetup(): Promise<string> {
  return new Promise((resolve) => {
    root.innerHTML = `
      <div style="padding:32px 20px;max-width:360px;margin:0 auto;font-family:sans-serif;">
        <div style="color:#06C755;font-size:1.5rem;text-align:center;margin-bottom:8px;">💰</div>
        <h1 style="font-size:1.1rem;text-align:center;margin-bottom:4px;color:#222;">割り勘アプリへようこそ</h1>
        <p style="color:#666;font-size:0.85rem;text-align:center;margin-bottom:24px;">
          グループを作成して、招待リンクをLINEグループで共有してください。
        </p>
        <input id="gname" type="text" placeholder="グループ名（例：旅行メンバー）"
          style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:1rem;
                 box-sizing:border-box;margin-bottom:10px;outline:none;-webkit-appearance:none;" />
        <button id="create-btn"
          style="width:100%;padding:13px;background:#06C755;color:white;border:none;
                 border-radius:8px;font-size:1rem;cursor:pointer;font-weight:bold;">
          グループを作成
        </button>
        <div id="err" style="color:#E53935;font-size:0.82rem;margin-top:6px;min-height:18px;text-align:center;"></div>
        <div id="invite" style="display:none;margin-top:24px;padding:16px;background:#f7f7f7;border-radius:10px;">
          <p style="color:#333;font-size:0.85rem;margin:0 0 8px;font-weight:bold;">
            ✅ グループを作成しました
          </p>
          <p style="color:#666;font-size:0.82rem;margin:0 0 10px;">
            以下の招待リンクをLINEグループトークに貼り付けてメンバーを招待してください。
          </p>
          <div id="invite-url"
            style="background:#fff;padding:10px;border-radius:6px;font-size:0.72rem;
                   word-break:break-all;color:#06C755;margin-bottom:10px;border:1px solid #e0e0e0;"></div>
          <button id="copy-btn"
            style="width:100%;padding:10px;background:#fff;color:#06C755;border:2px solid #06C755;
                   border-radius:8px;font-size:0.9rem;cursor:pointer;margin-bottom:8px;font-weight:bold;">
            リンクをコピー
          </button>
          <button id="open-btn"
            style="width:100%;padding:10px;background:#06C755;color:white;border:none;
                   border-radius:8px;font-size:0.9rem;cursor:pointer;font-weight:bold;">
            アプリを開く →
          </button>
        </div>
      </div>
    `

    const gnameEl = document.getElementById('gname') as HTMLInputElement
    const createBtn = document.getElementById('create-btn') as HTMLButtonElement
    const errEl = document.getElementById('err') as HTMLDivElement
    const inviteEl = document.getElementById('invite') as HTMLDivElement
    const inviteUrlEl = document.getElementById('invite-url') as HTMLDivElement
    const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement
    const openBtn = document.getElementById('open-btn') as HTMLButtonElement
    let createdGroupId = ''

    createBtn.addEventListener('click', async () => {
      const name = gnameEl.value.trim()
      if (!name) { errEl.textContent = 'グループ名を入力してください'; return }
      createBtn.disabled = true
      errEl.textContent = ''
      const lineGroupId = 'app-' + Date.now()
      try {
        createBtn.textContent = '作成中…'
        const result = await ensureGroup(lineGroupId, name)

        createdGroupId = result.id
        localStorage.setItem('groupId', createdGroupId)
        localStorage.setItem('joinToken', result.join_token)
        const liffId = import.meta.env.VITE_LIFF_ID as string
        const inviteUrl = `https://liff.line.me/${liffId}?gid=${createdGroupId}&token=${result.join_token}`
        inviteUrlEl.textContent = inviteUrl
        inviteEl.style.display = 'block'
        gnameEl.style.display = 'none'
        createBtn.style.display = 'none'
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errEl.style.color = '#E53935'
        errEl.textContent = `エラー: ${msg}`
        createBtn.disabled = false
        createBtn.textContent = 'グループを作成'
      }
    })

    copyBtn.addEventListener('click', () => {
      const token = localStorage.getItem('joinToken') ?? ''
      const liffId = import.meta.env.VITE_LIFF_ID as string
      const inviteUrl = `https://liff.line.me/${liffId}?gid=${createdGroupId}&token=${token}`
      navigator.clipboard.writeText(inviteUrl).catch(() => {})
      copyBtn.textContent = 'コピーしました！'
      setTimeout(() => { copyBtn.textContent = 'リンクをコピー' }, 2000)
    })

    openBtn.addEventListener('click', () => resolve(createdGroupId))
  })
}

async function bootstrap() {
  showLoading()

  try {
    await initLiff()

    // ユーザーをDBに登録（認証後すぐ）
    const meData = await getMe()

    const urlParams = new URLSearchParams(window.location.search)
    // ?reset=1 でLocalStorageをクリア（デバッグ・再設定用）
    if (urlParams.get('reset') === '1') {
      localStorage.removeItem('groupId')
      sessionStorage.clear()
    }
    const gidFromUrl   = urlParams.get('gid')
    const tokenFromUrl = urlParams.get('token') ?? ''
    const ctx = getGroupContext()
    const savedGroupId = localStorage.getItem('groupId')

    let dbGroupId: string

    if (gidFromUrl) {
      // 招待リンク経由で参加（join_token を検証）
      dbGroupId = gidFromUrl
      const joinRes = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/groups/${gidFromUrl}/join?token=${encodeURIComponent(tokenFromUrl)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}` } }
      )
      if (!joinRes.ok) {
        const err = await joinRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? `参加に失敗しました (${joinRes.status})`)
      }
      localStorage.setItem('groupId', dbGroupId)
    } else if (ctx) {
      // LINEグループコンテキストあり（将来的にBot参加時に対応）
      const groupData = await ensureGroup(ctx.groupId)
      dbGroupId = groupData.id
      localStorage.setItem('groupId', dbGroupId)
    } else if (savedGroupId) {
      // 2回目以降の利用
      dbGroupId = savedGroupId
    } else {
      // 初回かつグループ未設定 → グループ作成UI
      dbGroupId = await showGroupSetup()
    }

    sessionStorage.setItem('groupId', dbGroupId)
    sessionStorage.setItem('userId', meData.id)

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </React.StrictMode>
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Bootstrap failed:', err)
    showError(`初期化に失敗しました。<br><br><small style="word-break:break-all;">${msg}</small>`)
  }
}

bootstrap()
