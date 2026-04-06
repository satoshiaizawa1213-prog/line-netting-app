import { useState } from 'react'
import { getGroupMembers } from '@/lib/api'

interface Props {
  currentGroupId: string
  onJoin: (groupId: string) => void
}

export default function JoinGroupPage({ currentGroupId, onJoin }: Props) {
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)

  const shortCode = currentGroupId.slice(0, 8).toUpperCase()

  async function handleJoin() {
    const code = inputCode.trim()
    if (!code) return

    setChecking(true)
    setError('')

    try {
      // グループIDの前方一致で検索（短縮コードから復元）
      const members = await getGroupMembers(code)
      if (members.length === 0) throw new Error('not found')
      onJoin(code)
    } catch {
      setError('グループが見つかりませんでした。コードを確認してください。')
    } finally {
      setChecking(false)
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(currentGroupId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page">
      <div className="page-header">🏠 グループに参加</div>

      {/* 自分のグループコード */}
      <div className="card">
        <div className="section-title">あなたのグループコード</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.2em', margin: '12px 0', textAlign: 'center' }}>
          {shortCode}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub)', marginBottom: 12, textAlign: 'center' }}>
          このコードを他のメンバーに共有してください
        </div>
        <button className="btn-secondary" onClick={copyCode}>
          {copied ? 'コピーしました ✅' : 'グループIDをコピー'}
        </button>
      </div>

      {/* 他のグループに参加 */}
      <div className="card">
        <div className="section-title">他のグループに参加する</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-sub)', marginBottom: 10 }}>
          他のメンバーのグループIDを貼り付けてください
        </div>
        <input
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: '0.95rem' }}
          placeholder="グループIDを貼り付け"
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value)}
        />
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: 6 }}>{error}</p>}
      </div>

      <div className="bottom-actions">
        <button className="btn-primary" onClick={handleJoin} disabled={!inputCode.trim() || checking}>
          {checking ? '確認中...' : '参加する'}
        </button>
        <button className="btn-secondary" onClick={() => onJoin(currentGroupId)}>
          このまま続ける（自分だけで使う）
        </button>
      </div>
    </div>
  )
}
