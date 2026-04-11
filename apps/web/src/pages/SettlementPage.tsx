import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createProposal, getProposals } from '@/lib/api'
import { shareToLine } from '@/lib/liff'
import type { NettingMethod, SettlementProposal } from '@/types'

export default function SettlementPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const groupId = sessionStorage.getItem('groupId') ?? ''
  const [method, setMethod] = useState<NettingMethod>('multilateral')

  const pendingCount = (location.state as { pendingCount?: number } | null)?.pendingCount ?? 0

  // 既存の pending 提案を確認
  const { data: proposals = [] } = useQuery<SettlementProposal[]>({
    queryKey: ['proposals', groupId],
    queryFn: () => getProposals(groupId),
  })
  const hasPending = proposals.length > 0

  const [proposed, setProposed] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const mutation = useMutation({
    mutationFn: () => createProposal(groupId, method),
    onSuccess: () => setProposed(true),
  })

  const joinToken = localStorage.getItem('joinToken') ?? ''
  const shareText = `🤝 精算が提案されました。\n\nアプリを開いて承認してください 👇\nhttps://liff.line.me/${import.meta.env.VITE_LIFF_ID as string}?gid=${groupId}&token=${joinToken}`

  async function handleShare() {
    setShareError(null)
    const result = await shareToLine(shareText)
    if (result.status === 'sent') {
      navigate('/')
    } else if (result.status !== 'cancelled') {
      setShareError(result.message ?? '通知の送信に失敗しました')
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page">
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)' }}>←</button>
        精算を提案する
      </div>

      {/* 提案完了 → 通知画面 */}
      {proposed && (
        <>
          <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>🤝</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>提案しました</div>
            <div style={{ color: 'var(--color-text-sub)', fontSize: '0.85rem' }}>
              全員が承認すると精算が実行されます
            </div>
          </div>
          <div className="card" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>📣 メンバーに通知する</div>
            <div style={{ fontSize: '0.83rem', color: 'var(--color-text-sub)', marginBottom: 12, lineHeight: 1.6 }}>
              LINE グループに承認依頼を送りましょう。タップするとシェア画面が開きます。
            </div>
            <button className="btn-primary" onClick={handleShare} style={{ marginBottom: 8 }}>
              LINE グループに通知する
            </button>
            {shareError && (
              <>
                <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem', margin: '4px 0 10px', lineHeight: 1.5 }}>
                  ⚠️ {shareError}
                </p>
                <button className="btn-secondary" onClick={handleCopy} style={{ fontSize: '0.85rem' }}>
                  {copied ? '✅ コピーしました' : '📋 メッセージをコピーする'}
                </button>
              </>
            )}
          </div>
          <button className="btn-ghost" style={{ color: 'var(--color-text-sub)' }} onClick={() => navigate('/')}>
            通知せずにホームへ
          </button>
        </>
      )}

      {!proposed && <>
      {/* 全員合意の説明 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🤝</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#15803d', marginBottom: 4 }}>全員合意制</div>
          <div style={{ fontSize: '0.82rem', color: '#166534', lineHeight: 1.6 }}>
            提案後、グループの全メンバーが承認すると精算が実行されます。
            LINEで承認リクエストが通知されます。
          </div>
        </div>
      </div>

      {/* 既存の提案がある場合 */}
      {hasPending && (
        <div className="card" style={{ background: '#fffbeb', border: '1.5px solid #fbbf24' }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 4 }}>⚠️ 承認待ちの提案があります</div>
          <p style={{ fontSize: '0.83rem', color: '#78350f', margin: 0 }}>
            既に精算提案が進行中です。新しい提案はできません。<br />
            ホーム画面から既存の提案を確認してください。
          </p>
          <button className="btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate('/')}>
            ホームで確認する
          </button>
        </div>
      )}

      {/* 精算方式 */}
      {!hasPending && (
        <>
          <p style={{ color: 'var(--color-text-sub)', fontSize: '0.9rem' }}>精算方式を選んでください</p>

          <div
            className="card"
            style={{ cursor: 'pointer', border: `2px solid ${method === 'multilateral' ? 'var(--color-primary)' : 'transparent'}` }}
            onClick={() => setMethod('multilateral')}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" checked={method === 'multilateral'} onChange={() => setMethod('multilateral')} style={{ marginTop: 3, accentColor: 'var(--color-primary)' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>マルチラテラル（推奨）</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)' }}>
                  全員の貸し借りをまとめて計算。支払い回数が最小になります。
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: 4 }}>
                  例）4人の場合、最大3回の支払いで完結
                </div>
              </div>
            </label>
          </div>

          <div
            className="card"
            style={{ cursor: 'pointer', border: `2px solid ${method === 'bilateral' ? 'var(--color-primary)' : 'transparent'}` }}
            onClick={() => setMethod('bilateral')}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" checked={method === 'bilateral'} onChange={() => setMethod('bilateral')} style={{ marginTop: 3, accentColor: 'var(--color-primary)' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>バイラテラル</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)' }}>
                  2人ずつペアで相殺。誰が誰にいくら払うか明確です。
                </div>
              </div>
            </label>
          </div>

          {pendingCount > 0 && (
            <div className="card" style={{ background: '#fffbeb', border: '1.5px solid #fbbf24' }}>
              <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 4 }}>⚠️ 承認待ちの支払いがあります</div>
              <p style={{ fontSize: '0.83rem', color: '#78350f', margin: 0 }}>
                承認待ちが {pendingCount} 件あります。承認されていない支払いは精算対象外です。
              </p>
            </div>
          )}

          {mutation.isError && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
              {(mutation.error as Error)?.message ?? '失敗しました。もう一度お試しください。'}
            </p>
          )}

          <div className="bottom-actions">
            <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? '提案中...' : '🤝 精算を提案する'}
            </button>
          </div>
        </>
      )}
      </>}
    </div>
  )
}
