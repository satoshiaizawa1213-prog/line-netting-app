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

async function bootstrap() {
  showLoading()

  try {
    await initLiff()

    const urlParams = new URLSearchParams(window.location.search)
    const gidFromUrl = urlParams.get('gid')

    const ctx = getGroupContext()
    if (!ctx && !gidFromUrl && !localStorage.getItem('groupId')) {
      showError('LINEグループのトーク内でこのアプリを開いてください。')
      return
    }

    // ユーザー登録 & 必要に応じてグループ登録（並列）
    const [groupData, meData] = await Promise.all([
      ctx ? ensureGroup(ctx.groupId) : Promise.resolve({ id: gidFromUrl ?? localStorage.getItem('groupId') ?? '' }),
      getMe(),
    ])

    const savedGroupId = localStorage.getItem('groupId')

    let dbGroupId: string
    if (gidFromUrl) {
      // URL 経由で参加 → そのグループにメンバー登録
      dbGroupId = gidFromUrl
      await fetch(`${import.meta.env.VITE_API_BASE_URL}/groups/${gidFromUrl}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
      })
      localStorage.setItem('groupId', dbGroupId)
    } else if (savedGroupId) {
      dbGroupId = savedGroupId
    } else {
      dbGroupId = groupData.id
      localStorage.setItem('groupId', dbGroupId)
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
