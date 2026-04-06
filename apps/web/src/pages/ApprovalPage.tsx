import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPayments, approvePayment, deletePayment } from '@/lib/api'
import type { Payment } from '@/types'

export default function ApprovalPage() {
  const groupId  = sessionStorage.getItem('groupId') ?? ''
  const myUserId = sessionStorage.getItem('userId') ?? ''
  const { paymentId } = useParams<{ paymentId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ['payments', groupId],
    queryFn: () => getPayments(groupId),
  })
  const payment = payments.find((p) => p.id === paymentId)

  const [rejectComment,   setRejectComment]   = useState('')
  const [showRejectForm,  setShowRejectForm]  = useState(false)
  const [confirmDelete,   setConfirmDelete]   = useState(false)

  const mutation = useMutation({
    mutationFn: ({ action, comment }: { action: 'approved' | 'rejected'; comment?: string }) =>
      approvePayment(paymentId!, action, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', groupId] })
      qc.invalidateQueries({ queryKey: ['balance', groupId] })
      navigate('/')
    },
  })

  if (isLoading) {
    return <div className="page"><p style={{ color: 'var(--color-text-sub)' }}>読み込み中...</p></div>
  }
  if (!payment) {
    return (
      <div className="page">
        <p style={{ color: 'var(--color-text-sub)', textAlign: 'center', marginTop: 40 }}>
          報告が見つかりませんでした
        </p>
        <div className="bottom-actions">
          <button className="btn-secondary" onClick={() => navigate('/')}>ホームに戻る</button>
        </div>
      </div>
    )
  }

  const isReporter   = payment.reporter_id === myUserId
  const isPending    = payment.status === 'pending'
  const isRejected   = payment.status === 'rejected'
  const myShare      = payment.splits?.find((s) => s.user_id === myUserId)?.amount ?? 0
  const alreadyActed = payment.my_approval != null

  const deleteMutation = useMutation({
    mutationFn: () => deletePayment(paymentId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', groupId] })
      navigate('/')
    },
  })

  function handleResubmit() {
    navigate('/payments/new', {
      state: {
        description: payment.description,
        amount: payment.amount,
        payerId: payment.payer_id,
        splits: payment.splits,
        oldPaymentId: payment.id,
      },
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        支払い報告の確認
      </div>

      {/* 報告内容 */}
      <div className="card">
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-sub)', marginBottom: 10 }}>
          {payment.reporter?.display_name} が報告 · {new Date(payment.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          <span style={{ marginLeft: 8 }}>
            <span className={`badge ${payment.status === 'pending' ? 'badge-pending' : payment.status === 'approved' ? 'badge-approved' : 'badge-rejected'}`}>
              {payment.status === 'pending' ? '承認待ち' : payment.status === 'approved' ? '承認済み' : '却下'}
            </span>
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: '1.15rem', marginBottom: 4 }}>{payment.description}</div>
        {payment.note && (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)', marginTop: 4, padding: '6px 10px', background: 'var(--color-bg)', borderRadius: 6 }}>
            📝 {payment.note}
          </div>
        )}
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text)' }}>¥{payment.amount.toLocaleString()}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)', marginTop: 6 }}>
          立替者: {payment.payer?.display_name}
          {payment.payer_id === myUserId && <span style={{ color: 'var(--color-primary)', marginLeft: 6 }}>（自分）</span>}
        </div>
      </div>

      {/* 自分の負担額 */}
      {myShare > 0 && payment.payer_id !== myUserId && (
        <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div className="section-title">あなたの負担分</div>
          <div className="amount-large amount-negative">¥{myShare.toLocaleString()}</div>
        </div>
      )}

      {/* 却下コメント */}
      {isRejected && payment.approvals && payment.approvals.length > 0 && payment.approvals[0].comment && (
        <div className="card" style={{ borderLeft: '3px solid var(--color-danger)' }}>
          <div className="section-title" style={{ color: 'var(--color-danger)' }}>却下の理由</div>
          <p style={{ fontSize: '0.9rem', margin: 0 }}>{payment.approvals[0].comment}</p>
        </div>
      )}

      {/* 全員の内訳 */}
      <div className="card">
        <div className="section-title">内訳</div>
        {payment.splits?.map((s) => (
          <div key={s.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ fontWeight: s.user_id === myUserId ? 600 : 400 }}>
              {s.user?.display_name ?? s.user_id}
              {s.user_id === myUserId && <span style={{ color: 'var(--color-text-sub)', fontWeight: 400 }}> (自分)</span>}
              {s.user_id === payment.payer_id && <span style={{ color: 'var(--color-primary)', marginLeft: 4, fontSize: '0.75rem' }}>立替</span>}
            </span>
            <span style={{ fontWeight: 600 }}>¥{s.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* 却下コメント入力 */}
      {showRejectForm && (
        <div className="card">
          <div className="section-title">却下の理由（任意）</div>
          <textarea
            style={{ width: '100%', minHeight: 80, padding: 10, border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: '0.95rem', marginTop: 6, resize: 'none' }}
            placeholder="例: 金額が違います"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
          />
        </div>
      )}

      {mutation.isError && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
          送信に失敗しました。
        </p>
      )}

      {/* アクションボタン */}
      <div className="bottom-actions">
        {isPending && !isReporter && !alreadyActed && (
          showRejectForm ? (
            <>
              <button className="btn-danger" onClick={() => mutation.mutate({ action: 'rejected', comment: rejectComment })} disabled={mutation.isPending}>
                {mutation.isPending ? '送信中...' : '却下を送信する'}
              </button>
              <button className="btn-secondary" onClick={() => setShowRejectForm(false)}>キャンセル</button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setShowRejectForm(true)} style={{ flex: 1 }}>
                却下する
              </button>
              <button className="btn-primary" onClick={() => mutation.mutate({ action: 'approved' })} disabled={mutation.isPending} style={{ flex: 2 }}>
                {mutation.isPending ? '...' : '承認する ✅'}
              </button>
            </div>
          )
        )}
        {isReporter && isPending && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-sub)', fontSize: '0.85rem' }}>
            自分の報告は承認できません。他のメンバーの承認を待ちましょう。
          </p>
        )}
        {isReporter && isRejected && (
          confirmDelete ? (
            <>
              <p style={{ textAlign: 'center', color: 'var(--color-danger)', fontSize: '0.85rem' }}>本当に削除しますか？</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>キャンセル</button>
                <button className="btn-danger" style={{ flex: 1 }} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? '削除中...' : '削除する'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(true)}>
                削除
              </button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={handleResubmit}>
                修正して再申請
              </button>
            </div>
          )
        )}
        {!isPending && !isRejected && (
          <button className="btn-secondary" onClick={() => navigate('/')}>ホームに戻る</button>
        )}
        {isRejected && !isReporter && (
          <button className="btn-secondary" onClick={() => navigate('/')}>ホームに戻る</button>
        )}
      </div>
    </div>
  )
}
