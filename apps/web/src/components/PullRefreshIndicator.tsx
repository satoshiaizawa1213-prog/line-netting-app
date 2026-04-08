import type { PullState } from '@/hooks/usePullToRefresh'

const RADIUS = 14
const CIRC   = 2 * Math.PI * RADIUS  // ≈ 87.96

interface Props {
  pullY: number
  pullState: PullState
  threshold?: number
}

export function PullRefreshIndicator({ pullY, pullState, threshold = 68 }: Props) {
  if (pullState === 'idle') return null

  const ratio       = Math.min(pullY / threshold, 1)
  const dashOffset  = CIRC * (1 - ratio)
  const isSpinning  = pullState === 'refreshing'
  const isDone      = pullState === 'done'
  const isTriggered = pullState === 'triggered'

  // インジケーターの Y 位置（引っ張りに追従）
  const indicatorY  = Math.min(pullY, threshold * 0.75)

  return (
    <div
      style={{
        position:  'fixed',
        top:       0,
        left:      0,
        right:     0,
        zIndex:    200,
        display:   'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        transform: `translateY(${indicatorY - 20}px)`,
        transition: isSpinning || isDone
          ? 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease'
          : 'none',
        opacity: isDone ? 0 : 1,
      }}
    >
      <div
        style={{
          width:        44,
          height:       44,
          borderRadius: '50%',
          background:   'rgba(255,255,255,0.95)',
          boxShadow:    '0 2px 12px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          style={{
            transform:  isTriggered ? 'rotate(180deg)' : `rotate(${ratio * 270}deg)`,
            transition: isSpinning ? 'none' : 'transform 0.15s ease',
            animation:  isSpinning ? 'ptr-spin 0.75s linear infinite' : 'none',
          }}
        >
          {/* 背景リング */}
          <circle
            cx="16" cy="16" r={RADIUS}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="2.5"
          />
          {/* 進捗リング */}
          <circle
            cx="16" cy="16" r={RADIUS}
            fill="none"
            stroke={isTriggered || isSpinning ? '#06C755' : '#06C755'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={isSpinning ? CIRC * 0.25 : dashOffset}
            transform="rotate(-90 16 16)"
            style={{
              transition: isSpinning ? 'none' : 'stroke-dashoffset 0.05s linear',
            }}
          />
          {/* 中央アイコン */}
          {isSpinning ? (
            // スピナー中は何も表示しない（リングだけ）
            null
          ) : isDone ? (
            // 完了チェック
            <polyline
              points="10,16 14,20 22,12"
              fill="none"
              stroke="#06C755"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            // 引っ張り中の矢印
            <path
              d="M16 10 L16 22 M11 17 L16 22 L21 17"
              fill="none"
              stroke={isTriggered ? '#06C755' : '#9CA3AF'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: 'stroke 0.15s ease' }}
            />
          )}
        </svg>
      </div>

      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
