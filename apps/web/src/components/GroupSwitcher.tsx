import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyGroups, ensureGroup, deleteGroup } from '@/lib/api'

interface Props {
  currentGroupId: string
  onClose: () => void
  onSwitch: (groupId: string) => void
}

export function GroupSwitcher({ currentGroupId, onClose, onSwitch }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: string; inviteUrl: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  async function handleCreate() {
    const name = groupName.trim()
    if (!name) { setError('グループ名を入力してください'); return }
    setLoading(true)
    setError('')
    try {
      const lineGroupId = 'app-' + Date.now()
      const result = await ensureGroup(lineGroupId, name)
      const liffId = import.meta.env.VITE_LIFF_ID as string
      const inviteUrl = `https://liff.line.me/${liffId}?gid=${result.id}&token=${result.join_token}`
      localStorage.setItem('groupId', result.id)
      localStorage.setItem('joinToken', result.join_token)
      qc.invalidateQueries({ queryKey: ['my-groups'] })
      setCreated({ id: result.id, inviteUrl })
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!created) return
    navigator.clipboard.writeText(created.inviteUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenNew() {
    if (!created) return
    sessionStorage.setItem('groupId', created.id)
    qc.clear()
    onSwitch(created.id)
  }

  async function handleDelete(groupId: string) {
    setDeleting(true)
    try {
      await deleteGroup(groupId)
      setDeleteTargetId(null)
      qc.invalidateQueries({ queryKey: ['my-groups'] })
      if (groupId === currentGroupId) {
        localStorage.removeItem('groupId')
        localStorage.removeItem('joinToken')
        sessionStorage.removeItem('groupId')
        qc.clear()
        window.location.reload()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setDeleting(false)
    }
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
        maxHeight: '80dvh',
        overflowY: 'auto',
      }}>
        {/* ハンドル */}
        <div style={{ width: 36, height: 4, background: 'var(--color-border)', borderRadius: 2, margin: '0 auto 16px' }} />

        {!creating ? (
          <>
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
              const isDeleteTarget = deleteTargetId === g.id
              return (
                <div key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div
                    style={{
                      width: '100%', padding: '14px 20px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div
                      onClick={() => handleSwitch(g.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        flex: 1, minWidth: 0, cursor: 'pointer',
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
                    </div>
                    {g.is_creator && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTargetId(isDeleteTarget ? null : g.id) }}
                        style={{
                          width: 'auto', padding: '4px 8px', fontSize: '0.75rem',
                          background: 'none', border: '1px solid var(--color-border)',
                          borderRadius: 6, color: 'var(--color-text-sub)', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {isDeleteTarget ? '✕' : '削除'}
                      </button>
                    )}
                  </div>
                  {isDeleteTarget && (
                    <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)', flex: 1 }}>
                        全データが削除されます
                      </span>
                      <button
                        onClick={() => handleDelete(g.id)}
                        disabled={deleting}
                        style={{
                          width: 'auto', padding: '6px 14px', fontSize: '0.8rem',
                          background: 'var(--color-danger)', border: 'none', borderRadius: 8,
                          color: '#fff', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {deleting ? '削除中…' : '削除する'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setCreating(true)}
                className="btn-primary"
                style={{ width: '100%', fontSize: '0.9rem' }}
              >
                ＋ 新しいグループを作成
              </button>
              <button
                onClick={onClose}
                className="btn-ghost"
                style={{ width: '100%', fontSize: '0.9rem' }}
              >
                キャンセル
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {!created && (
                <button onClick={() => setCreating(false)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: 0, color: 'var(--color-text-sub)' }}>←</button>
              )}
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>
                新しいグループを作成
              </div>
            </div>

            <div style={{ padding: '0 20px' }}>
              {!created ? (
                <>
                  <input
                    type="text"
                    placeholder="グループ名（例：旅行メンバー）"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    style={{
                      width: '100%', padding: '12px 14px',
                      border: '1.5px solid var(--color-border)', borderRadius: 10,
                      fontSize: '1rem', boxSizing: 'border-box', marginBottom: 8,
                      outline: 'none', fontFamily: 'inherit', color: 'var(--color-text)',
                      background: 'var(--color-bg)',
                    }}
                    autoFocus
                  />
                  {error && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</div>
                  )}
                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="btn-primary"
                    style={{ width: '100%' }}
                  >
                    {loading ? '作成中…' : 'グループを作成'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ background: 'rgba(6,199,85,0.08)', border: '1px solid rgba(6,199,85,0.3)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: '1.1rem' }}>✅</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.9rem' }}>グループを作成しました</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-sub)', lineHeight: 1.5, marginBottom: 10 }}>
                      招待リンクをLINEグループトークに貼り付けてメンバーを招待してください。
                    </div>
                    <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '8px 10px', fontSize: '0.7rem', color: 'var(--color-primary)', wordBreak: 'break-all', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                      {created.inviteUrl}
                    </div>
                    <button onClick={handleCopy} className="btn-secondary" style={{ width: '100%', fontSize: '0.85rem', marginBottom: 8 }}>
                      {copied ? '✅ コピーしました' : '🔗 招待リンクをコピー'}
                    </button>
                  </div>
                  <button onClick={handleOpenNew} className="btn-primary" style={{ width: '100%' }}>
                    このグループを開く →
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
