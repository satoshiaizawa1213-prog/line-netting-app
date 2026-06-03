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

const DARK_BG = '#0A0E0D'
const DARK_SURFACE = '#151D1A'
const DARK_SURFACE_2 = '#1C2622'
const DARK_BORDER = 'rgba(255,255,255,.09)'
const DARK_TEXT = '#EAF2EE'
const DARK_TEXT_2 = '#9FB1AA'
const ACCENT = '#06C755'
const ACCENT_INK = '#04160C'

function showLoading() {
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;gap:14px;background:${DARK_BG};">
      <img src="/line_spinner_light.svg" width="30" height="30" alt="読み込み中" style="filter:invert(0.9) brightness(1.5)" />
    </div>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic UI',sans-serif;margin:0;max-width:480px;margin:0 auto;background:${DARK_BG};}
    </style>
  `
}

function showError(message: string) {
  // XSS対策: メッセージは innerHTML ではなく textContent で設定する
  root.innerHTML = `
    <div style="padding:32px 20px;text-align:center;background:${DARK_BG};min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${DARK_TEXT};">
      <div style="font-size:2rem;margin-bottom:16px;">⚠️</div>
      <p style="color:${DARK_TEXT};font-weight:800;font-size:1rem;margin-bottom:8px;">初期化に失敗しました</p>
      <p id="error-msg" style="color:${DARK_TEXT_2};font-size:0.83rem;line-height:1.6;word-break:break-all;"></p>
    </div>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;margin:0;max-width:480px;margin:0 auto;background:${DARK_BG};}</style>
  `
  const msgEl = document.getElementById('error-msg')
  if (msgEl) msgEl.textContent = message
}

function showGroupSetup(): Promise<string> {
  return new Promise((resolve) => {
    root.innerHTML = `
      <div style="min-height:100dvh;background:radial-gradient(70% 30% at 50% -5%, rgba(6,199,85,.12), transparent 70%),${DARK_BG};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;box-sizing:border-box;">
        <div style="width:100%;max-width:360px;">
          <div style="text-align:center;margin-bottom:28px;">
            <div style="width:64px;height:64px;background:${ACCENT};color:${ACCENT_INK};border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin:0 auto 16px;box-shadow:0 0 30px rgba(6,199,85,.45);">💰</div>
            <h1 style="font-size:1.2rem;font-weight:900;color:${DARK_TEXT};margin:0 0 6px;">割り勘アプリへようこそ</h1>
            <p style="color:${DARK_TEXT_2};font-size:0.85rem;margin:0;line-height:1.5;">グループを作成して、招待リンクを<br>LINEグループで共有してください。</p>
          </div>

          <div style="background:${DARK_SURFACE};border:1px solid ${DARK_BORDER};border-radius:14px;padding:20px;box-shadow:0 18px 50px -22px rgba(0,0,0,.8);">
            <input id="gname" type="text" placeholder="グループ名（例：旅行メンバー）"
              style="width:100%;padding:12px 14px;border:1px solid ${DARK_BORDER};border-radius:10px;font-size:1rem;
                     box-sizing:border-box;margin-bottom:12px;outline:none;-webkit-appearance:none;
                     font-family:inherit;color:${DARK_TEXT};background:${DARK_SURFACE_2};transition:border-color 0.15s,box-shadow 0.15s;" />
            <button id="create-btn"
              style="width:100%;padding:14px;background:${ACCENT};color:${ACCENT_INK};border:none;
                     border-radius:10px;font-size:1rem;cursor:pointer;font-weight:900;
                     box-shadow:0 14px 46px -8px rgba(6,199,85,.45);transition:opacity 0.15s,filter 0.15s;font-family:inherit;">
              グループを作成
            </button>
            <div id="err" style="color:#fca5a5;font-size:0.82rem;margin-top:8px;min-height:18px;text-align:center;"></div>
          </div>

          <div id="invite" style="display:none;margin-top:16px;background:${DARK_SURFACE};border:1px solid ${DARK_BORDER};border-radius:14px;padding:20px;box-shadow:0 18px 50px -22px rgba(0,0,0,.8);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="font-size:1.2rem;">✅</span>
              <span style="font-weight:800;color:${DARK_TEXT};font-size:0.95rem;">グループを作成しました</span>
            </div>
            <p style="color:${DARK_TEXT_2};font-size:0.82rem;margin:0 0 12px;line-height:1.5;">
              招待リンクをLINEグループトークに貼り付けてメンバーを招待してください。
            </p>
            <div id="invite-url"
              style="background:${DARK_SURFACE_2};border:1px solid ${DARK_BORDER};padding:10px 12px;border-radius:8px;font-size:0.72rem;
                     word-break:break-all;color:${ACCENT};margin-bottom:12px;font-weight:600;line-height:1.4;"></div>
            <button id="copy-btn"
              style="width:100%;padding:12px;background:transparent;color:${ACCENT};border:1.5px solid ${ACCENT};
                     border-radius:10px;font-size:0.9rem;cursor:pointer;margin-bottom:8px;font-weight:800;font-family:inherit;">
              🔗 リンクをコピー
            </button>
            <button id="open-btn"
              style="width:100%;padding:12px;background:${ACCENT};color:${ACCENT_INK};border:none;
                     border-radius:10px;font-size:0.9rem;cursor:pointer;font-weight:900;
                     box-shadow:0 14px 46px -8px rgba(6,199,85,.45);font-family:inherit;">
              アプリを開く →
            </button>
          </div>
        </div>
      </div>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic UI',sans-serif;margin:0;max-width:480px;margin:0 auto;background:${DARK_BG};color:${DARK_TEXT};}
        #gname:focus{border-color:${ACCENT};box-shadow:0 0 0 3px rgba(6,199,85,0.18);background:${DARK_SURFACE};}
      </style>
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
        errEl.style.color = '#fca5a5'
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
      // 既存グループと異なる場合は確認
      if (savedGroupId && savedGroupId !== gidFromUrl) {
        const ok = window.confirm(
          '別のグループの招待リンクです。\nこのグループに切り替えますか？\n\n（元のグループにはグループ名をタップして戻れます）'
        )
        if (!ok) {
          // キャンセル → 既存グループをそのまま使う
          dbGroupId = savedGroupId
          // URL からパラメータを消してリロード
          window.history.replaceState({}, '', window.location.pathname)
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
          return
        }
      }
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
    } else if (savedGroupId) {
      // 既存グループあり（通知リンクや2回目以降の利用）→ 最優先で使用
      dbGroupId = savedGroupId
    } else if (ctx) {
      // 初回 & LINEグループコンテキストあり
      try {
        const groupData = await ensureGroup(ctx.groupId)
        dbGroupId = groupData.id
        localStorage.setItem('groupId', dbGroupId)
      } catch (e) {
        // グループは存在するがメンバーでない（招待リンクが必要）
        if (e instanceof Error && e.message.includes('招待リンク')) {
          root.innerHTML = `
            <div style="min-height:100dvh;background:radial-gradient(70% 30% at 50% -5%, rgba(6,199,85,.12), transparent 70%),${DARK_BG};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;box-sizing:border-box;">
              <div style="width:100%;max-width:360px;text-align:center;">
                <div style="font-size:3rem;margin-bottom:16px;">🔗</div>
                <h1 style="font-size:1.1rem;font-weight:900;color:${DARK_TEXT};margin:0 0 12px;">招待リンクが必要です</h1>
                <p style="color:${DARK_TEXT_2};font-size:0.85rem;line-height:1.6;margin:0 0 24px;">
                  このグループにはすでにメンバーがいます。<br>
                  グループメンバーに<strong style="color:${DARK_TEXT};">招待リンク</strong>を共有してもらい、<br>
                  そのリンクからアプリを開いてください。
                </p>
                <div style="background:${DARK_SURFACE};border:1px solid ${DARK_BORDER};border-radius:12px;padding:16px;box-shadow:0 18px 50px -22px rgba(0,0,0,.8);font-size:0.82rem;color:${DARK_TEXT_2};line-height:1.6;">
                  💡 招待リンクは、すでに参加しているメンバーのアプリ内<br>「メンバー管理」→「招待リンクをコピー」から取得できます。
                </div>
              </div>
            </div>
            <style>body{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic UI',sans-serif;margin:0;max-width:480px;margin:0 auto;background:${DARK_BG};color:${DARK_TEXT};}</style>
          `
          return
        }
        throw e
      }
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
    showError(msg)
  }
}

bootstrap()
