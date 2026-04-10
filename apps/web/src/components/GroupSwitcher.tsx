import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyGroups } from '@/lib/api'

interface Props {
  currentGroupId: string
  onClose: () => void
  onSwitch: (groupId: string) => void
}

export function GroupSwitcher({ currentGroupId, onClose, onSwitch }: Props) {
  const qc = useQueryClient()
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['my-groups'],
    queryFn: getMyGroups,
  })

  function handleSwitch(groupId: string) {
    if (groupId === currentGroupId) { onClose(); return }
    localStorage.setItem('groupId', groupId)
    sessionStorage.setItem('groupId', groupId)
    qc.clear()
    onSwitch(groupId)
  }

  return (
    <>
      {/* オーバーレイ */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 100, backdropFilter: 'blur(2px)',
        }}
      />

      {/* シート */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: 'var(--color-card)',
        borderRadius: '20px 20px 0 0',
        padding: '12px 0 32px',
        zIndex: 101,
        boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
      }}>
        {/* ハンドル */}
        <div style={{ width: 36, height: 4, background: 'var(--color-border)', borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{ padding: '0 20px 12px', fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>
          グループを切り替え
        </div>

        {isLoading && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-sub)', fontSize: '0.85rem' }}>
            読み込み中...
          </div>
        )}

        {!isLoading && groups.map((g) => {
          const isCurrent = g.id === currentGroupId
          return (
            <button
              key={g.id}
              onClick={() => handleSwitch(g.id)}
              style={{
                width: '100%', padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: 12,
                background: isCurrent ? 'rgba(6,199,85,0.06)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: isCurrent ? 'var(--color-primary)' : 'var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
              }}>
                {isCurrent ? '✓' : '👥'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 700, fontSize: '0.95rem',
                  color: isCurrent ? 'var(--color-primary)' : 'var(--color-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {g.name ?? '名称未設定'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-sub)', marginTop: 2 }}>
                  {new Date(g.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}作成
                </div>
              </div>
              {isCurrent && (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0 }}>
                  使用中
                </span>
              )}
            </button>
          )
        })}

        <div style={{ padding: '12px 20px 0' }}>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ width: '100%', fontSize: '0.9rem' }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </>
  )
}
