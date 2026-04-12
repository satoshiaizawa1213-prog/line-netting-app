import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGroupMembers, removeMember, updateMemberWeight } from '@/lib/api'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullRefreshIndicator } from '@/components/PullRefreshIndicator'
import type { User } from '@/types'

export default function MembersPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const groupId   = sessionStorage.getItem('groupId') ?? ''
  const myUserId  = sessionStorage.getItem('userId') ?? ''
  const [copied,    setCopied]    = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editWeightId,  setEditWeightId]  = useState<string | null>(null)
  const [weightInput,   setWeightInput]   = useState('')
  const { data: members = [], isLoading } = useQuery<User[]>({
    queryKey: ['members', groupId],
    queryFn:  () => getGroupMembers(groupId),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(groupId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', groupId] })
      setConfirmId(null)
    },
  })

  const weightMutation = useMutation({
    mutationFn: ({ userId, weight }: { userId: string; weight: number }) =>
      updateMemberWeight(groupId, userId, weight),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', groupId] })
      setEditWeightId(null)
    },
  })

  const { pullY, pullState } = usePullToRefresh(() => qc.invalidateQueries({ queryKey: ['members', groupId] }))

  function copyInviteLink() {
    const liffId    = import.meta.env.VITE_LIFF_ID as string
    const joinToken = localStorage.getItem('joinToken') ?? ''
    const url       = `https://liff.line.me/${liffId}?gid=${groupId}&token=${joinToken}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openWeightEdit(m: User) {
    setEditWeightId(m.id)
    setWeightInput(String(m.weight ?? 1))
    setConfirmId(null)
  }

  function submitWeight(userId: string) {
    const w = parseFloat(weightInput)
    if (!w || w <= 0) return
    weightMutation.mutate({ userId, weight: w })
  }

  // 全メンバーの weight の最大値（相対表示用）
  const maxWeight = Math.max(...members.map((m) => m.weight ?? 1), 1)

  return (
    <div className="page">
      <PullRefreshIndicator pullY={pullY} pullState={pullState} />
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        メンバー管理
      </div>

      {/* 招待 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div className="section-title" style={{ color: '#15803d', marginBottom: 2 }}>メンバーを招待</div>
            <p style={{ fontSize: '0.83rem', color: '#166534' }}>
              招待リンクをコピーして LINE で共有しましょう。
            </p>
          </div>
          <span style={{ fontSize: '1.4rem' }}>🔗</span>
        </div>
        <button className="btn-primary" onClick={copyInviteLink} style={{ marginTop: 4 }}>
          {copied ? '✅ コピーしました！' : '招待リンクをコピー'}
        </button>
      </div>

      {/* 傾斜説明 */}
      <div className="card" style={{ background: '#fafafa', border: '1px solid var(--color-border)' }}>
        <div className="section-title">傾斜割について</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
          重みが大きいほど負担割合が増えます。デフォルトは全員 ×1。<br />
          例）重み 2:1:1 で 1,000円 → <strong>500円・250円・250円</strong>
        </p>
      </div>

      {/* メンバー一覧 */}
      <div className="card">
        <div className="section-title">参加中のメンバー（{members.length}人）</div>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton" style={{ width: '50%', height: 14, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '30%', height: 11, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {members.map((m) => (
          <div key={m.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: editWeightId === m.id ? 'none' : '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                {m.picture_url ? (
                  <img src={m.picture_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>👤</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {m.display_name}
                    {m.id === myUserId && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginLeft: 6 }}>（自分）</span>
                    )}
                  </div>
                  {/* 傾斜バー */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--color-border)', borderRadius: 2, maxWidth: 80 }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'var(--color-primary)', width: `${((m.weight ?? 1) / maxWeight) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)' }}>
                      ×{m.weight ?? 1}
                    </span>
                    <button
                      onClick={() => openWeightEdit(m)}
                      style={{ width: 'auto', padding: '2px 8px', fontSize: '0.75rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-sub)' }}
                    >
                      編集
                    </button>
                  </div>
                </div>
              </div>

              {/* 削除ボタン（自分以外） */}
              {m.id !== myUserId && editWeightId !== m.id && (
                confirmId === m.id ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setConfirmId(null)} style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-sub)' }}>
                      キャンセル
                    </button>
                    <button onClick={() => removeMutation.mutate(m.id)} disabled={removeMutation.isPending} style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', background: 'var(--color-danger)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600 }}>
                      削除
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmId(m.id)} style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-sub)', flexShrink: 0 }}>
                    削除
                  </button>
                )
              )}
            </div>

            {/* weight 編集フォーム */}
            {editWeightId === m.id && (
              <div style={{ padding: '10px 0 14px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)', marginBottom: 8 }}>
                  {m.display_name} の傾斜（重み）を設定
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="0.5"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    style={{ width: 80, padding: '8px 10px', border: '1.5px solid var(--color-primary)', borderRadius: 8, fontSize: '1rem', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)' }}>（現在: ×{m.weight ?? 1}）</span>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, padding: '8px' }}
                    onClick={() => submitWeight(m.id)}
                    disabled={weightMutation.isPending}
                  >
                    保存
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ width: 'auto', padding: '8px 12px' }}
                    onClick={() => setEditWeightId(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
