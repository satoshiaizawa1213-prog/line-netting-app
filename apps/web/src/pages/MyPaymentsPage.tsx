import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyPaymentTasks, updatePaymentTaskPaid, getMyReceiveTasks, updateReceiveTaskReceived } from '@/lib/api'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullRefreshIndicator } from '@/components/PullRefreshIndicator'
import type { MyPaymentTask, MyReceiveTask } from '@/types'

type Tab = 'pay' | 'receive'

/** タスクを人ごとにまとめる */
function groupPayByUser(tasks: MyPaymentTask[]) {
  const map = new Map<string, { user: MyPaymentTask['to_user']; tasks: MyPaymentTask[] }>()
  for (const t of tasks) {
    const key = t.to_user?.id ?? 'unknown'
    if (!map.has(key)) map.set(key, { user: t.to_user, tasks: [] })
    map.get(key)!.tasks.push(t)
  }
  return [...map.values()]
}

function groupReceiveByUser(tasks: MyReceiveTask[]) {
  const map = new Map<string, { user: MyReceiveTask['from_user']; tasks: MyReceiveTask[] }>()
  for (const t of tasks) {
    const key = t.from_user?.id ?? 'unknown'
    if (!map.has(key)) map.set(key, { user: t.from_user, tasks: [] })
    map.get(key)!.tasks.push(t)
  }
  return [...map.values()]
}

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

  const reload = () => {
    qc.invalidateQueries({ queryKey: ['my-tasks', groupId] })
    qc.invalidateQueries({ queryKey: ['my-receive-tasks', groupId] })
  }
  const { pullY, pullState } = usePullToRefresh(reload)

  const pendingPay   = payTasks.filter((t) => !t.paid)
  const completedPay = payTasks.filter((t) => t.paid)
  const pendingRcv   = receiveTasks.filter((t) => !t.received)
  const completedRcv = receiveTasks.filter((t) => t.received)

  const isLoading = tab === 'pay' ? payLoading : receiveLoading

  return (
    <div className="page">
      <PullRefreshIndicator pullY={pullY} pullState={pullState} />
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        振込み・受取り
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 8, background: 'var(--color-card)', borderRadius: 12, padding: 4 }}>
        {([['pay', '振込み', pendingPay.length], ['receive', '受取り', pendingRcv.length]] as const).map(([key, label, count]) => (
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
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map((i) => (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton" style={{ width: '50%', height: 14, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '30%', height: 20, borderRadius: 6 }} />
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ width: '80%', height: 12, borderRadius: 6 }} />
                <div className="skeleton" style={{ width: '60%', height: 12, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
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
              <div className="section-title">未振込</div>
              {groupPayByUser(pendingPay).map((group) => (
                <PayGroupCard
                  key={group.user?.id ?? 'unknown'}
                  user={group.user}
                  tasks={group.tasks}
                  onToggle={(id, paid) => payMutation.mutate({ id, paid })}
                  isPending={payMutation.isPending}
                  done={false}
                />
              ))}
            </section>
          )}
          {completedPay.length > 0 && (
            <section>
              <div className="section-title">振込み済み</div>
              {groupPayByUser(completedPay).map((group) => (
                <PayGroupCard
                  key={group.user?.id ?? 'unknown'}
                  user={group.user}
                  tasks={group.tasks}
                  onToggle={(id, paid) => payMutation.mutate({ id, paid })}
                  isPending={payMutation.isPending}
                  done={true}
                />
              ))}
            </section>
          )}
        </>
      )}

      {/* 受取りタブ */}
      {!isLoading && tab === 'receive' && (
        <>
          {receiveTasks.length === 0 && (
            <div className="card empty-state">
              <div className="empty-state-icon">💰</div>
              <div className="empty-state-title">受取りタスクはありません</div>
              <div className="empty-state-desc">精算が実行されると受取り先が表示されます</div>
            </div>
          )}
          {pendingRcv.length > 0 && (
            <section>
              <div className="section-title">未受取</div>
              {groupReceiveByUser(pendingRcv).map((group) => (
                <ReceiveGroupCard
                  key={group.user?.id ?? 'unknown'}
                  user={group.user}
                  tasks={group.tasks}
                  onToggle={(id, received) => receiveMutation.mutate({ id, received })}
                  isPending={receiveMutation.isPending}
                  done={false}
                />
              ))}
            </section>
          )}
          {completedRcv.length > 0 && (
            <section>
              <div className="section-title">受取済み</div>
              {groupReceiveByUser(completedRcv).map((group) => (
                <ReceiveGroupCard
                  key={group.user?.id ?? 'unknown'}
                  user={group.user}
                  tasks={group.tasks}
                  onToggle={(id, received) => receiveMutation.mutate({ id, received })}
                  isPending={receiveMutation.isPending}
                  done={true}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ───── 人ごとにまとめた振込みカード ───── */

function PayGroupCard({
  user, tasks, onToggle, isPending, done,
}: {
  user: MyPaymentTask['to_user']
  tasks: MyPaymentTask[]
  onToggle: (id: string, paid: boolean) => void
  isPending: boolean
  done: boolean
}) {
  const total = tasks.reduce((s, t) => s + t.amount, 0)
  const allDone = tasks.every((t) => t.paid)

  return (
    <div className="card" style={{ marginBottom: 10, opacity: done ? 0.7 : 1 }}>
      {/* ヘッダー: アバター + 名前 + 合計金額 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: tasks.length > 1 ? 12 : 0 }}>
        {user?.picture_url ? (
          <img src={user.picture_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #fee2e2, #fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>💸</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text)' }}>
            {user?.display_name ?? '不明'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-sub)', marginTop: 1 }}>
            {tasks.length > 1 ? `${tasks.length}件の振込み` : '振込み'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: allDone ? 'var(--color-text-muted)' : 'var(--color-danger)', letterSpacing: '-0.02em' }}>
            ¥{total.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 明細（複数ある場合） */}
      {tasks.length > 1 && (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
          {tasks.map((t, i) => {
            const date = t.settlement
              ? new Date(t.settlement.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
              : ''
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < tasks.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <CheckButton checked={t.paid} onToggle={() => onToggle(t.id, !t.paid)} disabled={isPending} color="var(--color-danger)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.83rem', color: t.paid ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: t.paid ? 'line-through' : 'none' }}>
                    精算 {date}
                  </span>
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: t.paid ? 'var(--color-text-muted)' : 'var(--color-text)', flexShrink: 0 }}>
                  ¥{t.amount.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 1件だけの場合はチェックボタンを直接表示 */}
      {tasks.length === 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={() => onToggle(tasks[0].id, !tasks[0].paid)}
            disabled={isPending}
            style={{
              padding: '6px 16px', fontSize: '0.8rem', fontWeight: 700, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: tasks[0].paid ? 'var(--color-bg)' : 'var(--color-danger)',
              color: tasks[0].paid ? 'var(--color-text-sub)' : '#fff',
              transition: 'all 0.15s',
            }}
          >
            {tasks[0].paid ? '✓ 振込み済み' : '振込み完了にする'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ───── 人ごとにまとめた受取りカード ───── */

function ReceiveGroupCard({
  user, tasks, onToggle, isPending, done,
}: {
  user: MyReceiveTask['from_user']
  tasks: MyReceiveTask[]
  onToggle: (id: string, received: boolean) => void
  isPending: boolean
  done: boolean
}) {
  const total = tasks.reduce((s, t) => s + t.amount, 0)
  const allDone = tasks.every((t) => t.received)

  return (
    <div className="card" style={{ marginBottom: 10, opacity: done ? 0.7 : 1 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: tasks.length > 1 ? 12 : 0 }}>
        {user?.picture_url ? (
          <img src={user.picture_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #e8f9ef, #c7f3da)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>💰</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text)' }}>
            {user?.display_name ?? '不明'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-sub)', marginTop: 1 }}>
            {tasks.length > 1 ? `${tasks.length}件の受取り` : '受取り'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: allDone ? 'var(--color-text-muted)' : 'var(--color-primary)', letterSpacing: '-0.02em' }}>
            ¥{total.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 明細 */}
      {tasks.length > 1 && (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
          {tasks.map((t, i) => {
            const date = t.settlement
              ? new Date(t.settlement.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
              : ''
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < tasks.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <CheckButton checked={t.received} onToggle={() => onToggle(t.id, !t.received)} disabled={isPending} color="var(--color-primary)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.83rem', color: t.received ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: t.received ? 'line-through' : 'none' }}>
                    精算 {date}
                  </span>
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: t.received ? 'var(--color-text-muted)' : 'var(--color-text)', flexShrink: 0 }}>
                  ¥{t.amount.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {tasks.length === 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={() => onToggle(tasks[0].id, !tasks[0].received)}
            disabled={isPending}
            style={{
              padding: '6px 16px', fontSize: '0.8rem', fontWeight: 700, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: tasks[0].received ? 'var(--color-bg)' : 'var(--color-primary)',
              color: tasks[0].received ? 'var(--color-text-sub)' : '#fff',
              transition: 'all 0.15s',
            }}
          >
            {tasks[0].received ? '✓ 受取済み' : '受取り完了にする'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ───── 共通チェックボタン ───── */

function CheckButton({ checked, onToggle, disabled, color }: {
  checked: boolean
  onToggle: () => void
  disabled: boolean
  color: string
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: 22, height: 22, borderRadius: '50%', border: '2px solid',
        borderColor: checked ? 'var(--color-primary)' : color,
        background: checked ? 'var(--color-primary)' : 'transparent',
        color: '#fff', fontSize: '0.7rem', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s', padding: 0,
      }}
    >
      {checked ? '✓' : ''}
    </button>
  )
}
