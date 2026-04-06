import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getGroupBalance, getPayments } from '@/lib/api'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import type { Payment, GroupBalance } from '@/types'

export default function HomePage() {
  const groupId = sessionStorage.getItem('groupId') ?? ''
  const myUserId = sessionStorage.getItem('userId') ?? ''
  const navigate = useNavigate()
  const qc       = useQueryClient()

  function reload() {
    qc.invalidateQueries({ queryKey: ['payments', groupId] })
    qc.invalidateQueries({ queryKey: ['balance',  groupId] })
  }

  const { pullY, triggered } = usePullToRefresh(reload)

  const { data: balances = [], isLoading: balanceLoading } = useQuery<GroupBalance[]>({
    queryKey: ['balance', groupId],
    queryFn: () => getGroupBalance(groupId),
  })

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ['payments', groupId],
    queryFn: () => getPayments(groupId),
  })

  const myBalance = balances.find((b) => b.user_id === myUserId)?.balance ?? 0
  const pending   = payments.filter((p) => p.status === 'pending')
  const approved  = payments.filter((p) => p.status === 'approved')
  const rejected  = payments.filter((p) => p.status === 'rejected')

  return (
    <div className="page">
      {/* プル・トゥ・リフレッシュ インジケーター */}
      {pullY > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: Math.min(pullY, 56),
          background: 'var(--color-bg)',
          color: triggered ? 'var(--color-primary)' : 'var(--color-text-sub)',
          fontSize: '0.85rem', transition: 'color 0.2s',
        }}>
          {triggered ? '↑ 離して更新' : '↓ 引っ張って更新'}
        </div>
      )}
      <div className="page-header" style={{ justifyContent: 'space-between' }}>
        <span>🏠 グループ精算</span>
        <button onClick={reload} style={{ width: 'auto', padding: '4px 10px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.85rem', color: 'var(--color-text-sub)' }}>
          ↻ 更新
        </button>
      </div>

      {/* 残高カード */}
      <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div className="section-title">あなたの残高</div>
        {balanceLoading ? (
          <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-sub)' }}>---</div>
        ) : (
          <>
            <div className={`amount-large ${myBalance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
              {myBalance >= 0 ? '+' : ''}¥{myBalance.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', marginTop: 4 }}>
              {myBalance > 0 ? '受け取り超過' : myBalance < 0 ? '支払い超過' : '精算済み'}
            </div>
          </>
        )}
      </div>

      {/* 承認待ち */}
      {!paymentsLoading && pending.length > 0 && (
        <section>
          <div className="section-title">承認待ち ({pending.length})</div>
          {pending.map((p) => (
            <PaymentCard key={p.id} payment={p} myUserId={myUserId} onClick={() => navigate(`/payments/${p.id}`)} />
          ))}
        </section>
      )}

      {/* 確定済み（未精算） */}
      {!paymentsLoading && approved.length > 0 && (
        <section>
          <div className="section-title">確定済み・未精算 ({approved.length})</div>
          {approved.map((p) => (
            <PaymentCard key={p.id} payment={p} myUserId={myUserId} />
          ))}
        </section>
      )}

      {/* 却下済み */}
      {!paymentsLoading && rejected.length > 0 && (
        <section>
          <div className="section-title">却下済み ({rejected.length})</div>
          {rejected.map((p) => (
            <PaymentCard key={p.id} payment={p} myUserId={myUserId} onClick={() => navigate(`/payments/${p.id}`)} />
          ))}
        </section>
      )}

      {/* 空状態 */}
      {!paymentsLoading && pending.length === 0 && approved.length === 0 && rejected.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-sub)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>💸</div>
          <div>支払い報告がありません</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>「支払いを報告する」から登録しましょう</div>
        </div>
      )}

      <div className="bottom-actions">
        <button className="btn-primary" onClick={() => navigate('/payments/new')}>
          ＋ 支払いを報告する
        </button>
        <button
          className="btn-secondary"
          onClick={() => navigate('/settlements/new', { state: { pendingCount: pending.length } })}
          disabled={approved.length === 0}
        >
          精算する {approved.length > 0 ? `(${approved.length}件)` : ''}
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: '0.85rem' }}
          onClick={() => navigate('/settlements/history')}
        >
          📋 精算履歴
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: '0.85rem' }}
          onClick={() => navigate('/my-payments')}
        >
          💳 自分の支払いタスク
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: '0.85rem' }}
          onClick={() => navigate('/members')}
        >
          👥 メンバー管理
        </button>
      </div>
    </div>
  )
}

function PaymentCard({ payment, myUserId, onClick }: { payment: Payment; myUserId: string; onClick?: () => void }) {
  const isPayer  = payment.payer_id === myUserId
  const mySplit  = payment.splits?.find((s) => s.user_id === myUserId)
  // 自分が立替者の場合: 自分のsplitを除いた分が受取予定
  const receiveAmount = isPayer
    ? payment.amount - (mySplit?.amount ?? 0)
    : 0

  return (
    <div
      className="card"
      style={{ marginBottom: 8, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{payment.description}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-sub)' }}>
            {payment.payer?.display_name} · ¥{payment.amount.toLocaleString()}
          </div>
          {isPayer && receiveAmount > 0 && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-primary)', marginTop: 2, fontWeight: 600 }}>
              あなたが立替 → 受取予定 ¥{receiveAmount.toLocaleString()}
            </div>
          )}
          {isPayer && receiveAmount === 0 && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-sub)', marginTop: 2 }}>
              あなたが立替（全額自己負担）
            </div>
          )}
          {!isPayer && mySplit && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-danger)', marginTop: 2, fontWeight: 600 }}>
              あなたの負担: ¥{mySplit.amount.toLocaleString()}
            </div>
          )}
          {!isPayer && !mySplit && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-sub)', marginTop: 2 }}>
              あなたの負担なし
            </div>
          )}
        </div>
        <span className={`badge ${payment.status === 'pending' ? 'badge-pending' : payment.status === 'rejected' ? 'badge-rejected' : 'badge-approved'}`}>
          {payment.status === 'pending' ? '承認待ち' : payment.status === 'rejected' ? '却下' : '確定'}
        </span>
      </div>
    </div>
  )
}
