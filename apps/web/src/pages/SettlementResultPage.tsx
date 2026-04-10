import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { shareSettlementResult } from '@/lib/liff'
import { AdBanner } from '@/components/AdBanner'
import type { Settlement, SettlementResult } from '@/types'

const METHOD_LABEL: Record<string, string> = {
  multilateral: 'マルチラテラル方式',
  bilateral:    'バイラテラル方式',
}

export default function SettlementResultPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const { state } = useLocation() as { state: { settlement: Settlement } }
  const settlement = state?.settlement
  const myUserId   = sessionStorage.getItem('userId') ?? ''
  const groupId    = sessionStorage.getItem('groupId') ?? ''

  function goHome() {
    qc.invalidateQueries({ queryKey: ['payments', groupId] })
    qc.invalidateQueries({ queryKey: ['balance',  groupId] })
    qc.invalidateQueries({ queryKey: ['settlements', groupId] })
    navigate('/')
  }

  if (!settlement) {
    navigate('/')
    return null
  }

  const [sharing, setSharing] = useState(false)
  const results: SettlementResult[] = settlement.results ?? []
  const myResults = results.filter((r) => r.from_user_id === myUserId)

  async function handleShare() {
    setSharing(true)
    const date = new Date(settlement.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    const lines = [
      `💰 精算完了 (${date})`,
      '',
      ...results.map((r) => `${r.from_user?.display_name} → ${r.to_user?.display_name}  ¥${r.amount.toLocaleString()}`),
      results.length === 0 ? '支払いなし' : '',
    ].filter((l) => l !== undefined)
    await shareSettlementResult(lines.join('\n'))
    setSharing(false)
  }

  return (
    <div className="page">
      <div className="page-header">精算結果</div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎉</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>精算完了</div>
        <div style={{ color: 'var(--color-text-sub)', fontSize: '0.85rem', marginTop: 4 }}>
          {METHOD_LABEL[settlement.method]} · {new Date(settlement.created_at).toLocaleString('ja-JP')}
        </div>
      </div>

      {myResults.length > 0 && (
        <div>
          <div className="section-title">あなたの支払い</div>
          {myResults.map((r, i) => (
            <div key={i} className="card" style={{ marginBottom: 8, borderLeft: '4px solid var(--color-danger)' }}>
              <div style={{ fontWeight: 600 }}>{r.to_user?.display_name} へ</div>
              <div className="amount-large amount-negative">¥{r.amount.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="section-title">支払いリスト（全員）</div>
        {results.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-sub)' }}>
            精算対象の支払いはありませんでした
          </div>
        ) : (
          results.map((r, i) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600 }}>{r.from_user?.display_name}</span>
                  <span style={{ color: 'var(--color-text-sub)' }}> → </span>
                  <span style={{ fontWeight: 600 }}>{r.to_user?.display_name}</span>
                </div>
                <div style={{ fontWeight: 700 }}>¥{r.amount.toLocaleString()}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', textAlign: 'center' }}>
        ※ 実際の支払いは各自で行ってください
      </p>

      <AdBanner />

      <div className="bottom-actions">
        <button className="btn-primary" onClick={handleShare} disabled={sharing}>
          {sharing ? '送信中...' : '📤 LINE にシェア'}
        </button>
        <button className="btn-secondary" onClick={goHome}>ホームに戻る</button>
      </div>
    </div>
  )
}
