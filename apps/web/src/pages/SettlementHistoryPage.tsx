import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettlementHistory } from '@/lib/api'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullRefreshIndicator } from '@/components/PullRefreshIndicator'
import type { Settlement } from '@/types'

const METHOD_LABEL: Record<string, string> = {
  multilateral: 'マルチラテラル',
  bilateral:    'バイラテラル',
}

export default function SettlementHistoryPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const groupId   = sessionStorage.getItem('groupId') ?? ''
  const myUserId  = sessionStorage.getItem('userId') ?? ''
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: settlements = [], isLoading } = useQuery<Settlement[]>({
    queryKey: ['settlements', groupId],
    queryFn:  () => getSettlementHistory(groupId),
  })

  const { pullY, pullState } = usePullToRefresh(() => qc.invalidateQueries({ queryKey: ['settlements', groupId] }))

  return (
    <div className="page">
      <PullRefreshIndicator pullY={pullY} pullState={pullState} />
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        精算履歴
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map((i) => (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: '70%', height: 14, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: '55%', height: 12, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && settlements.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">精算履歴がありません</div>
          <div className="empty-state-desc">精算を実行すると履歴が表示されます</div>
        </div>
      )}

      {settlements.map((s) => {
        const isOpen    = openId === s.id
        const payments  = s.settlement_payments?.map((sp) => sp.payments) ?? []
        const totalAmt  = payments.reduce((sum, p) => sum + (p?.amount ?? 0), 0)

        return (
          <div key={s.id} className="card" style={{ marginBottom: 12 }}>

            {/* ヘッダー（タップで詳細トグル） */}
            <div
              style={{ cursor: 'pointer' }}
              onClick={() => setOpenId(isOpen ? null : s.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="badge badge-approved" style={{ marginRight: 8 }}>
                    {METHOD_LABEL[s.method]}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-text-sub)' }}>
                    {new Date(s.created_at).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <span style={{ color: 'var(--color-text-sub)', fontSize: '0.9rem' }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* 精算結果サマリー */}
              <div style={{ marginTop: 10 }}>
                {s.results && s.results.length > 0 ? s.results.map((r, i) => {
                  const isMe    = r.from_user_id === myUserId
                  const toMe    = r.to_user_id   === myUserId
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '0.9rem' }}>
                        <span style={{ fontWeight: isMe ? 700 : 400, color: isMe ? 'var(--color-danger)' : 'inherit' }}>
                          {r.from_user?.display_name ?? '?'}
                        </span>
                        <span style={{ color: 'var(--color-text-sub)', margin: '0 4px' }}>→</span>
                        <span style={{ fontWeight: toMe ? 700 : 400, color: toMe ? 'var(--color-primary)' : 'inherit' }}>
                          {r.to_user?.display_name ?? '?'}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700 }}>¥{r.amount.toLocaleString()}</span>
                    </div>
                  )
                }) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>精算対象なし</p>
                )}
              </div>
            </div>

            {/* 詳細：含まれた支払い報告 */}
            {isOpen && payments.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '2px solid var(--color-border)', paddingTop: 12 }}>
                <div className="section-title" style={{ marginBottom: 8 }}>
                  含まれた支払い報告（{payments.length}件 / 合計 ¥{totalAmt.toLocaleString()}）
                </div>
                {payments.map((p) => {
                  if (!p) return null
                  const mySplit = p.splits?.find((sp) => sp.user_id === myUserId)
                  return (
                    <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.description}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', marginTop: 2 }}>
                            {p.payer?.display_name} · ¥{p.amount.toLocaleString()}
                          </div>
                          {mySplit && p.payer_id !== myUserId && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: 2 }}>
                              あなたの負担: ¥{mySplit.amount.toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-sub)', textAlign: 'right', marginLeft: 8 }}>
                          {new Date(p.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
