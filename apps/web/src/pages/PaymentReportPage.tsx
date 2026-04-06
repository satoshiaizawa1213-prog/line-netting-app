import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGroupMembers, createPayment, deletePayment } from '@/lib/api'
import type { User } from '@/types'

type SplitMode = 'equal' | 'weighted' | 'custom'

type ResubmitState = {
  description: string
  amount: number
  payerId: string
  splits: Array<{ user_id: string; amount: number }>
  oldPaymentId?: string
}

export default function PaymentReportPage() {
  const groupId  = sessionStorage.getItem('groupId') ?? ''
  const myUserId = sessionStorage.getItem('userId') ?? ''
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()

  const resubmit = location.state as ResubmitState | null

  const { data: members = [], isLoading } = useQuery<User[]>({
    queryKey: ['members', groupId],
    queryFn: () => getGroupMembers(groupId),
  })

  const [description,    setDescription]    = useState(resubmit?.description ?? '')
  const [note,           setNote]           = useState('')
  const [amountStr,      setAmountStr]      = useState(resubmit ? String(resubmit.amount) : '')
  const [payerId,        setPayerId]        = useState(resubmit?.payerId ?? myUserId)
  const [selected,       setSelected]       = useState<Set<string>>(
    resubmit ? new Set(resubmit.splits.map((s) => s.user_id)) : new Set()
  )
  const [splitMode,      setSplitMode]      = useState<SplitMode>(resubmit ? 'custom' : 'equal')
  const [customAmounts,  setCustomAmounts]  = useState<Record<string, string>>(
    resubmit ? Object.fromEntries(resubmit.splits.map((s) => [s.user_id, String(s.amount)])) : {}
  )

  // メンバー取得後に選択状態を設定（新規報告時のみ全員選択）
  useEffect(() => {
    if (members.length > 0 && !resubmit) {
      setSelected(new Set(members.map((m) => m.id)))
    }
  }, [members])

  const total          = Number(amountStr) || 0
  const selectedList   = members.filter((m) => selected.has(m.id))
  const equalShare     = selectedList.length > 0 ? Math.floor(total / selectedList.length) : 0
  const customTotal    = [...selected].reduce((s, uid) => s + (Number(customAmounts[uid]) || 0), 0)
  const isCustomValid  = splitMode === 'custom' ? customTotal === total : true

  // 傾斜割の各金額プレビュー
  const totalWeight    = selectedList.reduce((s, m) => s + (m.weight ?? 1), 0)
  const weightedShares = selectedList.map((m) => {
    return Math.floor(total * (m.weight ?? 1) / totalWeight)
  })
  const weightedRemainder = total - weightedShares.reduce((s, v) => s + v, 0)

  const canSubmit      = description.trim() !== '' && total > 0 && selectedList.length > 0 && isCustomValid

  const mutation = useMutation({
    mutationFn: createPayment,
    onSuccess: async () => {
      if (resubmit?.oldPaymentId) {
        await deletePayment(resubmit.oldPaymentId).catch(() => {})
      }
      qc.invalidateQueries({ queryKey: ['payments', groupId] })
      qc.invalidateQueries({ queryKey: ['balance', groupId] })
      navigate('/')
    },
  })

  function buildSplits() {
    if (splitMode === 'custom') {
      return selectedList.map((m) => ({
        user_id: m.id,
        amount: Number(customAmounts[m.id] || 0),
      }))
    }
    if (splitMode === 'weighted') {
      return selectedList.map((m, i) => ({
        user_id: m.id,
        amount: weightedShares[i] + (i === 0 ? weightedRemainder : 0),
      }))
    }
    // 均等割り
    const base      = Math.floor(total / selectedList.length)
    const remainder = total - base * selectedList.length
    return selectedList.map((m, i) => ({
      user_id: m.id,
      amount: i === 0 ? base + remainder : base,
    }))
  }

  function handleSubmit() {
    mutation.mutate({
      group_id: groupId,
      payer_id: payerId,
      amount: total,
      description: description.trim(),
      note: note.trim() || undefined,
      splits: buildSplits(),
    })
  }

  function toggleMember(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const pageTitle = resubmit ? '支払いを修正して再申請' : '支払いを報告する'

  if (isLoading) {
    return <div className="page"><div className="page-header">← {pageTitle}</div><p style={{ color: 'var(--color-text-sub)' }}>読み込み中...</p></div>
  }

  return (
    <div className="page">
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        {pageTitle}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* 用途 */}
        <div>
          <div className="section-title">用途</div>
          <input style={inputStyle} placeholder="例: 夕食代" value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        {/* 金額 */}
        <div>
          <div className="section-title">金額（円）</div>
          <input style={{ ...inputStyle, fontSize: '1.2rem', fontWeight: 600 }}
            type="number" inputMode="numeric" placeholder="0"
            value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
        </div>

        {/* 立替者 */}
        <div>
          <div className="section-title">立替者</div>
          <select style={inputStyle} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === myUserId ? `${m.display_name}（自分）` : m.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* 対象メンバー */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="section-title" style={{ marginBottom: 0 }}>対象メンバー</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ width: 'auto', padding: '2px 10px', fontSize: '0.8rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-sub)' }}
                onClick={() => setSelected(new Set(members.map((m) => m.id)))}>全員</button>
              <button style={{ width: 'auto', padding: '2px 10px', fontSize: '0.8rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-sub)' }}
                onClick={() => setSelected(new Set())}>解除</button>
            </div>
          </div>
          {members.map((m) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleMember(m.id)}
                style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }} />
              <span>{m.id === myUserId ? `${m.display_name}（自分）` : m.display_name}</span>
            </label>
          ))}
        </div>

        {/* 分割方法 */}
        <div>
          <div className="section-title">分割方法</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
            <input type="radio" checked={splitMode === 'equal'} onChange={() => setSplitMode('equal')}
              style={{ accentColor: 'var(--color-primary)' }} />
            <span>
              均等割り
              {total > 0 && selectedList.length > 0 && (
                <span style={{ color: 'var(--color-primary)', marginLeft: 8, fontWeight: 600 }}>
                  1人 ¥{equalShare.toLocaleString()}
                </span>
              )}
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
            <input type="radio" checked={splitMode === 'weighted'} onChange={() => setSplitMode('weighted')}
              style={{ accentColor: 'var(--color-primary)' }} />
            <span>傾斜割り（メンバー設定の重みで按分）</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
            <input type="radio" checked={splitMode === 'custom'} onChange={() => setSplitMode('custom')}
              style={{ accentColor: 'var(--color-primary)' }} />
            <span>金額を個別指定</span>
          </label>
        </div>

        {/* メモ */}
        <div>
          <div className="section-title">メモ（任意）</div>
          <input style={inputStyle} placeholder="例: 領収書あり、割り勘の理由など" value={note}
            onChange={(e) => setNote(e.target.value)} />
        </div>

        {/* 傾斜割プレビュー */}
        {splitMode === 'weighted' && selectedList.length > 0 && total > 0 && (
          <div>
            {selectedList.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.9rem' }}>
                <span>{m.id === myUserId ? `${m.display_name}（自分）` : m.display_name}
                  <span style={{ color: 'var(--color-text-sub)', fontSize: '0.78rem', marginLeft: 4 }}>×{m.weight ?? 1}</span>
                </span>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  ¥{(weightedShares[i] + (i === 0 ? weightedRemainder : 0)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 個別指定 */}
        {splitMode === 'custom' && (
          <div>
            {selectedList.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ fontSize: '0.9rem' }}>{m.id === myUserId ? `${m.display_name}（自分）` : m.display_name}</span>
                <input style={{ ...inputStyle, width: 110, textAlign: 'right', marginTop: 0 }} type="number" inputMode="numeric"
                  placeholder="0" value={customAmounts[m.id] ?? ''}
                  onChange={(e) => setCustomAmounts({ ...customAmounts, [m.id]: e.target.value })} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-sub)' }}>合計</span>
              <span style={{ fontWeight: 600, color: isCustomValid ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                ¥{customTotal.toLocaleString()} / ¥{total.toLocaleString()} {isCustomValid ? '✅' : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {mutation.isError && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
          送信に失敗しました。もう一度お試しください。
        </p>
      )}

      <div className="bottom-actions">
        <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? '送信中...' : '送信する'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 8,
  fontSize: '1rem',
  marginTop: 6,
  background: '#fff',
}
