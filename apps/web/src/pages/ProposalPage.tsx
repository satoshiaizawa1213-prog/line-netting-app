import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProposals, approveProposal, cancelProposal } from '@/lib/api'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullRefreshIndicator } from '@/components/PullRefreshIndicator'
import type { SettlementProposal } from '@/types'

const METHOD_LABEL: Record<string, string> = {
  multilateral: 'マルチラテラル',
  bilateral:    'バイラテラル',
}

export default function ProposalPage() {
  const { proposalId } = useParams<{ proposalId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const groupId  = sessionStorage.getItem('groupId') ?? ''
  const myUserId = sessionStorage.getItem('userId') ?? ''

  const { data: proposals = [], isLoading } = useQuery<SettlementProposal[]>({
    queryKey: ['proposals', groupId],
    queryFn: () => getProposals(groupId),
  })
  const proposal = proposals.find((p) => p.id === proposalId)

  const approveMutation = useMutation({
    mutationFn: () => approveProposal(proposalId!),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['proposals', groupId] })
      qc.invalidateQueries({ queryKey: ['balance', groupId] })
      qc.invalidateQueries({ queryKey: ['payments', groupId] })
      if (data.status === 'executed') {
        navigate('/', { replace: true })
      }
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelProposal(proposalId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals', groupId] })
      navigate('/', { replace: true })
    },
  })

  const { pullY, pullState } = usePullToRefresh(() => qc.invalidateQueries({ queryKey: ['proposals', groupId] }))

  if (isLoading) {
    return (
      <div className="page">
        <PullRefreshIndicator pullY={pullY} pullState={pullState} />
        <div className="page-header">
          <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)' }}>←</button>
          精算の承認
        </div>
        <p style={{ color: 'var(--color-text-sub)', textAlign: 'center' }}>読み込み中...</p>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="page">
        <div className="page-header">
          <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)' }}>←</button>
          精算の承認
        </div>
        <div className="card empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">提案が見つかりません</div>
          <div className="empty-state-desc">既に実行またはキャンセルされた可能性があります</div>
        </div>
        <div className="bottom-actions">
          <button className="btn-secondary" onClick={() => navigate('/')}>ホームに戻る</button>
        </div>
      </div>
    )
  }

  const isProposer = proposal.proposed_by === myUserId
  const remaining = proposal.total_members - proposal.vote_count

  return (
    <div className="page">
      <PullRefreshIndicator pullY={pullY} pullState={pullState} />
      <div className="page-header">
        <button onClick={() => navigate(-1)} style={{ width: 'auto', padding: '4px 8px', background: 'none', color: 'var(--color-text)' }}>←</button>
        精算の承認
      </div>

      {/* 提案概要 */}
      <div className="card">
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          精算提案
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {proposal.proposed_by_user?.display_name ?? '不明'}さんの提案
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', marginTop: 2 }}>
              {new Date(proposal.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 12px', fontSize: '0.82rem', fontWeight: 700 }}>
            {METHOD_LABEL[proposal.method]}
          </span>
        </div>

        {/* 承認進捗バー */}
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)' }}>承認状況</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {proposal.vote_count} / {proposal.total_members} 人
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: 4,
              background: 'linear-gradient(90deg, #06C755, #04b34a)',
              width: `${(proposal.vote_count / proposal.total_members) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-sub)', marginTop: 6 }}>
            {remaining > 0
              ? `あと ${remaining} 人の承認で精算が実行されます`
              : '全員承認済み — 精算が実行されました'}
          </div>
        </div>
      </div>

      {/* 自分の承認状態 */}
      {proposal.my_vote ? (
        <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '1.2rem' }}>✅</span>
          <div>
            <div style={{ fontWeight: 600, color: '#15803d', fontSize: '0.9rem' }}>承認済み</div>
            <div style={{ fontSize: '0.8rem', color: '#166534' }}>他のメンバーの承認を待っています</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ background: '#fffbeb', border: '1px solid #fbbf24', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '1.2rem' }}>⏳</span>
          <div>
            <div style={{ fontWeight: 600, color: '#92400e', fontSize: '0.9rem' }}>未承認</div>
            <div style={{ fontSize: '0.8rem', color: '#78350f' }}>あなたの承認が必要です</div>
          </div>
        </div>
      )}

      {/* エラー */}
      {approveMutation.isError && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
          {(approveMutation.error as Error)?.message ?? '失敗しました'}
        </p>
      )}
      {cancelMutation.isError && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
          キャンセルに失敗しました
        </p>
      )}

      <div className="bottom-actions">
        {!proposal.my_vote && (
          <button
            className="btn-primary"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
          >
            {approveMutation.isPending ? '承認中...' : '✅ 承認する'}
          </button>
        )}
        {isProposer && (
          <button
            className="btn-secondary"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
          >
            {cancelMutation.isPending ? 'キャンセル中...' : '提案をキャンセル'}
          </button>
        )}
        <button className="btn-ghost" onClick={() => navigate('/')}>
          ホームに戻る
        </button>
      </div>
    </div>
  )
}
