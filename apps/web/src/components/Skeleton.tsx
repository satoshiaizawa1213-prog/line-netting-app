/** 汎用スケルトンローダー */
export function Skeleton({ width, height = 16, radius = 6, style }: {
  width?: string | number
  height?: string | number
  radius?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton"
      style={{ width: width ?? '100%', height, borderRadius: radius, ...style }}
    />
  )
}

/** カード型スケルトン（HomePage のカードリスト用） */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <Skeleton width={3} height={40} radius={2} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </div>
          <Skeleton width={56} height={22} radius={999} />
        </div>
      ))}
    </div>
  )
}

/** 残高カード型スケルトン */
export function SkeletonBalanceCard() {
  return (
    <div className="balance-card">
      <Skeleton width={100} height={10} radius={4} style={{ background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ marginTop: 14 }}>
        <Skeleton width={180} height={42} radius={8} style={{ background: 'rgba(255,255,255,0.08)' }} />
      </div>
      <Skeleton width={80} height={12} radius={4} style={{ marginTop: 10, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

/** フォームページ用スケルトン */
export function SkeletonForm() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Skeleton width={50} height={10} />
        <Skeleton height={42} radius={10} style={{ marginTop: 8 }} />
      </div>
      <div>
        <Skeleton width={70} height={10} />
        <Skeleton height={42} radius={10} style={{ marginTop: 8 }} />
      </div>
      <div>
        <Skeleton width={60} height={10} />
        <Skeleton height={42} radius={10} style={{ marginTop: 8 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton width={80} height={10} />
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <Skeleton width={16} height={16} radius={3} />
            <Skeleton width="50%" height={14} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 詳細ページ用スケルトン */
export function SkeletonDetail() {
  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton width="35%" height={12} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="60%" height={18} />
            <Skeleton width="40%" height={13} />
          </div>
          <Skeleton width={120} height={36} radius={8} />
        </div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width={40} height={10} />
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <Skeleton width="40%" height={14} />
            <Skeleton width={70} height={14} />
          </div>
        ))}
      </div>
    </>
  )
}
