import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { getGroupBalance, getPayments, getGroupInfo, getProposals, approvePayment } from '@/lib/api'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullRefreshIndicator } from '@/components/PullRefreshIndicator'
import type { Payment, GroupBalance, SettlementProposal } from '@/types'

export default function HomePage() {
  const groupId = sessionStorage.getItem('groupId') ?? ''
  const myUserId = sessionStorage.getItem('userId') ?? ''
  const navigate = useNavigate()
  const qc       = useQueryClient()

  function reload() {
    qc.invalidateQueries({ queryKey: ['payments',  groupId] })
    qc.invalidateQueries({ queryKey: ['balance',   groupId] })
    qc.invalidateQueries({ queryKey: ['proposals', groupId] })
  }

  const { pullY, pullState } = usePullToRefresh(reload)

  const { data: groupInfo } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => getGroupInfo(groupId),
  })

  const { data: balances = [], isLoading: balanceLoading } = useQuery<GroupBalance[]>({
    queryKey: ['balance', groupId],
    queryFn: () => getGroupBalance(groupId),
  })

  const { data: proposals = [] } = useQuery<SettlementProposal[]>({
    queryKey: ['proposals', groupId],
    queryFn: () => getProposals(groupId),
  })

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ['payments', groupId],
    queryFn: () => getPayments(groupId),
  })

  const myBalance = balances.find((b) => b.user_id === myUserId)?.balance ?? 0
  const pending   = payments.filter((p) => p.status === 'pending')
  const approved  = payments.filter((p) => p.status === 'approved')
  const rejected  = payments.filter((p) => p.status === 'rejected')

  // 自分がまだ承認していない pending のみ一括承認対象
  const myPending  = pending.filter((p) => p.reporter_id !== myUserId && p.my_approval == null)
  const myReported = pending.filter((p) => p.reporter_id === myUserId)
  const [bulkDone, setBulkDone] = useState(false)

  const bulkMutation = useMutation({
    mutationFn: () =>
      Promise.all(myPending.map((p) => approvePayment(p.id, 'approved'))),
    onSuccess: () => {
      setBulkDone(true)
      qc.invalidateQueries({ queryKey: ['payments', groupId] })
      qc.invalidateQueries({ queryKey: ['balance',  groupId] })
      setTimeout(() => setBulkDone(false), 2000)
    },
  })

  return (
    <div className="page" style={{ paddingBottom: 24, gap: 16 }}>
      {/* プル・トゥ・リフレッシュ インジケーター */}
      <PullRefreshIndicator pullY={pullY} pullState={pullState} />

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>グループ</div>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
            {groupInfo?.name ?? '読み込み中…'}
          </div>
        </div>
        <button onClick={reload} className="btn-ghost" style={{ width: 'auto', fontSize: '0.8rem', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', color: 'var(--color-text-sub)', background: 'var(--color-card)' }}>
          ↻ 更新
        </button>
      </div>

      {/* 残高カード */}
      <div className="balance-card">
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          精算前の合計金額
        </div>
        {balanceLoading ? (
          <div style={{ height: 52, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '1.5rem', fontWeight: 800 }}>---</div>
        ) : (
          <>
            <div style={{
              fontSize: '2.6rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: myBalance >= 0 ? '#4ade80' : '#f87171',
            }}>
              {myBalance >= 0 ? '+' : ''}¥{myBalance.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: 6, fontWeight: 500 }}>
              {myBalance > 0 ? '受け取り予定' : myBalance < 0 ? '支払い予定' : '精算済み ✓'}
            </div>
          </>
        )}

        {/* 内訳サマリー */}
        {!paymentsLoading && (pending.length > 0 || approved.length > 0) && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', gap: 16 }}>
            {pending.length > 0 && (
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fbbf24' }}>{pending.length}</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>承認待ち</div>
              </div>
            )}
            {approved.length > 0 && (
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#4ade80' }}>{approved.length}</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>未精算</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 承認待ちの精算提案バナー */}
      {proposals.map((proposal) => (
        <div
          key={proposal.id}
          onClick={() => navigate(`/settlements/proposals/${proposal.id}`)}
          style={{
            background: proposal.my_vote
              ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
              : 'linear-gradient(135deg, #fffbeb, #fef3c7)',
            border: `1.5px solid ${proposal.my_vote ? '#86efac' : '#fbbf24'}`,
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            cursor: 'pointer',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{proposal.my_vote ? '✅' : '🤝'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: proposal.my_vote ? '#15803d' : '#92400e' }}>
              {proposal.my_vote ? '精算提案を承認済み' : '精算の承認が必要です'}
            </div>
            <div style={{ fontSize: '0.78rem', color: proposal.my_vote ? '#166534' : '#78350f', marginTop: 2 }}>
              {proposal.proposed_by_user?.display_name}さんの提案 ·
              承認 {proposal.vote_count}/{proposal.total_members} 人
            </div>
            {/* 進捗バー */}
            <div style={{ height: 4, background: 'rgba(0,0,0,0.1)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: proposal.my_vote ? '#22c55e' : '#f59e0b',
                width: `${(proposal.vote_count / proposal.total_members) * 100}%`,
              }} />
            </div>
          </div>
          <span style={{ fontSize: '0.8rem', color: proposal.my_vote ? '#15803d' : '#92400e', flexShrink: 0 }}>→</span>
        </div>
      ))}

      {/* クイックアクション */}
      <div className="quick-actions">
        <button className="quick-action-btn primary-action" onClick={() => navigate('/payments/new')}>
          <span className="icon">＋</span>
          <span>支払いを報告</span>
        </button>
        <button
          className="quick-action-btn"
          onClick={() => navigate('/settlements/new', { state: { pendingCount: pending.length } })}
          disabled={approved.length === 0}
          style={approved.length > 0 ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}
        >
          <span className="icon">🤝</span>
          <span>精算する{approved.length > 0 ? ` (${approved.length})` : ''}</span>
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/my-payments')}>
          <span className="icon">💳</span>
          <span>振込み・受け取り</span>
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/members')}>
          <span className="icon">👥</span>
          <span>メンバー管理</span>
        </button>
      </div>

      {/* 承認が必要 */}
      {!paymentsLoading && myPending.length > 0 && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0, color: '#C2410C' }}>承認が必要 ({myPending.length})</div>
            {myPending.length > 1 && (
              <button
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending || bulkDone}
                style={{
                  width: 'auto', padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700,
                  background: bulkDone ? 'var(--color-primary)' : '#fff',
                  color: bulkDone ? '#fff' : 'var(--color-primary)',
                  border: '1.5px solid var(--color-primary)',
                  borderRadius: 999,
                  boxShadow: bulkDone ? '0 2px 8px rgba(6,199,85,0.3)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {bulkDone ? '✅ 承認しました' : bulkMutation.isPending ? '承認中…' : `✅ ${myPending.length}件まとめて承認`}
              </button>
            )}
          </div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {myPending.map((p, i) => (
              <PaymentCard key={p.id} payment={p} myUserId={myUserId} onClick={() => navigate(`/payments/${p.id}`)} isLast={i === myPending.length - 1} />
            ))}
          </div>
        </section>
      )}

      {/* 自分の申告（承認待ち） */}
      {!paymentsLoading && myReported.length > 0 && (
        <section>
          <div className="section-title">自分の申告・承認待ち ({myReported.length})</div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {myReported.map((p, i) => (
              <PaymentCard key={p.id} payment={p} myUserId={myUserId} onClick={() => navigate(`/payments/${p.id}`)} isLast={i === myReported.length - 1} />
            ))}
          </div>
        </section>
      )}


      {/* 確定済み（未精算） */}
      {!paymentsLoading && approved.length > 0 && (
        <section>
          <div className="section-title">確定済み・未精算 ({approved.length})</div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {approved.map((p, i) => (
              <PaymentCard key={p.id} payment={p} myUserId={myUserId} isLast={i === approved.length - 1} />
            ))}
          </div>
        </section>
      )}

      {/* 却下済み */}
      {!paymentsLoading && rejected.length > 0 && (
        <section>
          <div className="section-title">却下済み ({rejected.length})</div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {rejected.map((p, i) => (
              <PaymentCard key={p.id} payment={p} myUserId={myUserId} onClick={() => navigate(`/payments/${p.id}`)} isLast={i === rejected.length - 1} />
            ))}
          </div>
        </section>
      )}

      {/* 空状態 */}
      {!paymentsLoading && pending.length === 0 && approved.length === 0 && rejected.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">💸</div>
          <div className="empty-state-title">支払い報告がありません</div>
          <div className="empty-state-desc">「支払いを報告」から登録しましょう</div>
        </div>
      )}

      {/* 精算履歴リンク */}
      <button
        className="btn-ghost"
        onClick={() => navigate('/settlements/history')}
        style={{ width: '100%', fontSize: '0.85rem', color: 'var(--color-text-sub)', padding: '10px', border: '1px dashed var(--color-border)', borderRadius: 10 }}
      >
        📋 精算履歴を見る
      </button>
    </div>
  )
}

function PaymentCard({ payment, myUserId, onClick, isLast }: { payment: Payment; myUserId: string; onClick?: () => void; isLast?: boolean }) {
  const isPayer  = payment.payer_id === myUserId
  const mySplit  = payment.splits?.find((s) => s.user_id === myUserId)
  const receiveAmount = isPayer ? payment.amount - (mySplit?.amount ?? 0) : 0

  const statusColor = payment.status === 'pending' ? '#F97316' : payment.status === 'rejected' ? 'var(--color-danger)' : 'var(--color-primary)'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ width: 3, height: 40, borderRadius: 2, background: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payment.description}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)' }}>
          {payment.payer?.display_name} · <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>¥{payment.amount.toLocaleString()}</span>
        </div>
        {isPayer && receiveAmount > 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-primary)', marginTop: 2, fontWeight: 600 }}>
            受取予定 ¥{receiveAmount.toLocaleString()}
          </div>
        )}
        {!isPayer && mySplit && (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-danger)', marginTop: 2, fontWeight: 600 }}>
            負担 ¥{mySplit.amount.toLocaleString()}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span className={`badge ${payment.status === 'pending' ? 'badge-pending' : payment.status === 'rejected' ? 'badge-rejected' : 'badge-approved'}`}>
          {payment.status === 'pending' ? '承認待ち' : payment.status === 'rejected' ? '却下' : '確定'}
        </span>
        {onClick && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>タップ →</span>}
      </div>
    </div>
  )
}
