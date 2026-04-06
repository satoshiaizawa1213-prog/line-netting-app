import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createSettlement } from '@/lib/api'
import type { NettingMethod } from '@/types'

export default function SettlementPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const groupId = sessionStorage.getItem('groupId') ?? ''
  const [method, setMethod] = useState<NettingMethod>('multilateral')
  const [confirmed, setConfirmed] = useState(false)

  const pendingCount = (location.state as { pendingCount?: number } | null)?.pendingCount ?? 0
  const needsConfirm = pendingCount > 0 && !confirmed

  const mutation = useMutation({
    mutationFn: () => createSettlement(groupId, method),
    onSuccess: (data) => navigate(`/settlements/${data.id}`, { state: { settlement: data } }),
  })

  return (
    <div className="page">
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)' }}>←</button>
        精算する
      </div>

      <p style={{ color: 'var(--color-text-sub)', fontSize: '0.9rem' }}>精算方式を選んでください</p>

      <div className="card" style={{ cursor: 'pointer', border: method === 'multilateral' ? '2px solid var(--color-primary)' : '2px solid transparent' }}
        onClick={() => setMethod('multilateral')}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="radio" checked={method === 'multilateral'} onChange={() => setMethod('multilateral')} style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>マルチラテラル</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)' }}>
              全員の貸し借りをまとめて計算。支払い回数が最小になります。
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: 6 }}>
              例）4人の場合、最大3回の支払いで完結
            </div>
          </div>
        </label>
      </div>

      <div className="card" style={{ cursor: 'pointer', border: method === 'bilateral' ? '2px solid var(--color-primary)' : '2px solid transparent' }}
        onClick={() => setMethod('bilateral')}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="radio" checked={method === 'bilateral'} onChange={() => setMethod('bilateral')} style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>バイラテラル</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)' }}>
              2人ずつペアで相殺。誰が誰にいくら払うか明確です。
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', marginTop: 6 }}>
              例）A↔B、B↔C をそれぞれ独立処理
            </div>
          </div>
        </label>
      </div>

      {needsConfirm && (
        <div className="card" style={{ background: '#FFF8E1', border: '1.5px solid #FFB300' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#E65100' }}>⚠️ 承認待ちの支払いがあります</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)', margin: '0 0 12px' }}>
            承認待ちの支払いが {pendingCount} 件あります。精算対象にならずスキップされます。このまま続けますか？
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => navigate(-1)}>戻る</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => setConfirmed(true)}>続ける</button>
          </div>
        </div>
      )}

      <div className="bottom-actions">
        <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || needsConfirm}>
          {mutation.isPending ? '計算中...' : 'この方式で精算する'}
        </button>
      </div>
    </div>
  )
}
