import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyPaymentTasks, updatePaymentTaskPaid } from '@/lib/api'
import type { MyPaymentTask } from '@/types'

export default function MyPaymentsPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const groupId   = sessionStorage.getItem('groupId') ?? ''

  const { data: tasks = [], isLoading, isError, error } = useQuery<MyPaymentTask[]>({
    queryKey: ['my-tasks', groupId],
    queryFn:  () => getMyPaymentTasks(groupId),
  })

  const mutation = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => updatePaymentTaskPaid(id, paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-tasks', groupId] }),
  })

  const pending   = tasks.filter((t) => !t.paid)
  const completed = tasks.filter((t) => t.paid)

  return (
    <div className="page">
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)', fontWeight: 400 }}>←</button>
        自分の支払いタスク
      </div>

      {isLoading && (
        <p style={{ color: 'var(--color-text-sub)', textAlign: 'center', marginTop: 32 }}>読み込み中...</p>
      )}

      {isError && (
        <div className="card" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
          読み込みに失敗しました: {(error as Error)?.message}
        </div>
      )}

      {!isLoading && !isError && tasks.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-sub)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
          <div>支払いタスクはありません</div>
        </div>
      )}

      {/* 未完了 */}
      {pending.length > 0 && (
        <section>
          <div className="section-title">未払い ({pending.length})</div>
          {pending.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={(paid) => mutation.mutate({ id: t.id, paid })} isPending={mutation.isPending} />
          ))}
        </section>
      )}

      {/* 完了済み */}
      {completed.length > 0 && (
        <section>
          <div className="section-title" style={{ marginTop: 16 }}>支払い済み ({completed.length})</div>
          {completed.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={(paid) => mutation.mutate({ id: t.id, paid })} isPending={mutation.isPending} />
          ))}
        </section>
      )}
    </div>
  )
}

function TaskCard({
  task,
  onToggle,
  isPending,
}: {
  task: MyPaymentTask
  onToggle: (paid: boolean) => void
  isPending: boolean
}) {
  const date = task.settlement
    ? new Date(task.settlement.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : ''

  return (
    <div className="card" style={{ marginBottom: 8, opacity: task.paid ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* チェックボックス */}
        <button
          onClick={() => onToggle(!task.paid)}
          disabled={isPending}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: '2px solid',
            borderColor: task.paid ? 'var(--color-primary)' : 'var(--color-border)',
            background: task.paid ? 'var(--color-primary)' : 'transparent',
            color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
          }}
        >
          {task.paid ? '✓' : ''}
        </button>

        {/* 内容 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', textDecoration: task.paid ? 'line-through' : 'none' }}>
            {task.to_user?.display_name ?? '不明'} に支払う
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', marginTop: 2 }}>
            精算日: {date}
            {task.settlement && (
              <span style={{ marginLeft: 8 }}>
                {task.settlement.method === 'multilateral' ? 'マルチラテラル' : 'バイラテラル'}
              </span>
            )}
          </div>
        </div>

        {/* 金額 */}
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: task.paid ? 'var(--color-text-sub)' : 'var(--color-danger)', flexShrink: 0 }}>
          ¥{task.amount.toLocaleString()}
        </div>
      </div>
    </div>
  )
}
