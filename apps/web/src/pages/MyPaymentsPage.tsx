import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyPaymentTasks, updatePaymentTaskPaid, getMyReceiveTasks, updateReceiveTaskReceived } from '@/lib/api'
import type { MyPaymentTask, MyReceiveTask } from '@/types'

type Tab = 'pay' | 'receive'

export default function MyPaymentsPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const groupId   = sessionStorage.getItem('groupId') ?? ''
  const [tab, setTab] = useState<Tab>('pay')

  const { data: payTasks = [], isLoading: payLoading } = useQuery<MyPaymentTask[]>({
    queryKey: ['my-tasks', groupId],
    queryFn:  () => getMyPaymentTasks(groupId),
  })

  const { data: receiveTasks = [], isLoading: receiveLoading } = useQuery<MyReceiveTask[]>({
    queryKey: ['my-receive-tasks', groupId],
    queryFn:  () => getMyReceiveTasks(groupId),
  })

  const payMutation = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => updatePaymentTaskPaid(id, paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-tasks', groupId] }),
  })

  const receiveMutation = useMutation({
    mutationFn: ({ id, received }: { id: string; received: boolean }) => updateReceiveTaskReceived(id, received),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-receive-tasks', groupId] }),
  })

  const pendingPay   = payTasks.filter((t) => !t.paid)
  const completedPay = payTasks.filter((t) => t.paid)
  const pendingRcv   = receiveTasks.filter((t) => !t.received)
  const completedRcv = receiveTasks.filter((t) => t.received)

  const isLoading = tab === 'pay' ? payLoading : receiveLoading

  return (
    <div className="page">
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        振込み・受け取り
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 8, background: 'var(--color-card)', borderRadius: 12, padding: 4 }}>
        {([['pay', '振込み', pendingPay.length], ['receive', '受け取り', pendingRcv.length]] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '9px 0', fontSize: '0.88rem', fontWeight: 700,
              borderRadius: 8, border: 'none',
              background: tab === key ? 'var(--color-primary)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--color-text-sub)',
              transition: 'all 0.15s',
            }}
          >
            {label}{count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {isLoading && (
        <p style={{ color: 'var(--color-text-sub)', textAlign: 'center', marginTop: 32 }}>読み込み中...</p>
      )}

      {/* 支払いタブ */}
      {!isLoading && tab === 'pay' && (
        <>
          {payTasks.length === 0 && (
            <div className="card empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">振込みはありません</div>
              <div className="empty-state-desc">精算が実行されると振込み先が表示されます</div>
            </div>
          )}
          {pendingPay.length > 0 && (
            <section>
              <div className="section-title">未振込 ({pendingPay.length})</div>
              <div className="card" style={{ padding: '4px 16px' }}>
                {pendingPay.map((t, i) => (
                  <PayTaskCard key={t.id} task={t} onToggle={(paid) => payMutation.mutate({ id: t.id, paid })} isPending={payMutation.isPending} isLast={i === pendingPay.length - 1} />
                ))}
              </div>
            </section>
          )}
          {completedPay.length > 0 && (
            <section>
              <div className="section-title">振込み済み ({completedPay.length})</div>
              <div className="card" style={{ padding: '4px 16px', opacity: 0.75 }}>
                {completedPay.map((t, i) => (
                  <PayTaskCard key={t.id} task={t} onToggle={(paid) => payMutation.mutate({ id: t.id, paid })} isPending={payMutation.isPending} isLast={i === completedPay.length - 1} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 受け取りタブ */}
      {!isLoading && tab === 'receive' && (
        <>
          {receiveTasks.length === 0 && (
            <div className="card empty-state">
              <div className="empty-state-icon">💰</div>
              <div className="empty-state-title">受け取りタスクはありません</div>
              <div className="empty-state-desc">精算が実行されると受け取り先が表示されます</div>
            </div>
          )}
          {pendingRcv.length > 0 && (
            <section>
              <div className="section-title">未受取 ({pendingRcv.length})</div>
              <div className="card" style={{ padding: '4px 16px' }}>
                {pendingRcv.map((t, i) => (
                  <ReceiveTaskCard key={t.id} task={t} onToggle={(received) => receiveMutation.mutate({ id: t.id, received })} isPending={receiveMutation.isPending} isLast={i === pendingRcv.length - 1} />
                ))}
              </div>
            </section>
          )}
          {completedRcv.length > 0 && (
            <section>
              <div className="section-title">受取済み ({completedRcv.length})</div>
              <div className="card" style={{ padding: '4px 16px', opacity: 0.75 }}>
                {completedRcv.map((t, i) => (
                  <ReceiveTaskCard key={t.id} task={t} onToggle={(received) => receiveMutation.mutate({ id: t.id, received })} isPending={receiveMutation.isPending} isLast={i === completedRcv.length - 1} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function PayTaskCard({
  task, onToggle, isPending, isLast,
}: {
  task: MyPaymentTask
  onToggle: (paid: boolean) => void
  isPending: boolean
  isLast?: boolean
}) {
  const date = task.settlement
    ? new Date(task.settlement.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}>
      <button
        onClick={() => onToggle(!task.paid)}
        disabled={isPending}
        style={{
          width: 28, height: 28, borderRadius: '50%', border: '2px solid',
          borderColor: task.paid ? 'var(--color-primary)' : 'var(--color-border)',
          background: task.paid ? 'var(--color-primary)' : 'transparent',
          color: '#fff', fontSize: '0.9rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s', padding: 0,
        }}
      >
        {task.paid ? '✓' : ''}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.93rem', textDecoration: task.paid ? 'line-through' : 'none', color: task.paid ? 'var(--color-text-sub)' : 'var(--color-text)' }}>
          {task.to_user?.display_name ?? '不明'} に振り込む
        </div>
        <div style={{ fontSize: '0.77rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{date}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: task.paid ? 'var(--color-text-muted)' : 'var(--color-danger)', flexShrink: 0 }}>
        ¥{task.amount.toLocaleString()}
      </div>
    </div>
  )
}

function ReceiveTaskCard({
  task, onToggle, isPending, isLast,
}: {
  task: MyReceiveTask
  onToggle: (received: boolean) => void
  isPending: boolean
  isLast?: boolean
}) {
  const date = task.settlement
    ? new Date(task.settlement.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}>
      <button
        onClick={() => onToggle(!task.received)}
        disabled={isPending}
        style={{
          width: 28, height: 28, borderRadius: '50%', border: '2px solid',
          borderColor: task.received ? 'var(--color-primary)' : '#f59e0b',
          background: task.received ? 'var(--color-primary)' : 'transparent',
          color: task.received ? '#fff' : '#f59e0b', fontSize: '0.9rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s', padding: 0,
        }}
      >
        {task.received ? '✓' : '¥'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.93rem', textDecoration: task.received ? 'line-through' : 'none', color: task.received ? 'var(--color-text-sub)' : 'var(--color-text)' }}>
          {task.from_user?.display_name ?? '不明'} から受け取る
        </div>
        <div style={{ fontSize: '0.77rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{date}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: task.received ? 'var(--color-text-muted)' : 'var(--color-primary)', flexShrink: 0 }}>
        ¥{task.amount.toLocaleString()}
      </div>
    </div>
  )
}
