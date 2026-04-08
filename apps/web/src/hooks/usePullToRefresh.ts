import { useEffect, useRef, useState, useCallback } from 'react'

const THRESHOLD  = 68   // 更新確定距離 (px)
const MAX_PULL   = 96   // 最大引っ張り量 (px)
const RESISTANCE = 0.45 // 引っ張り抵抗（低いほど重い）

export type PullState = 'idle' | 'pulling' | 'triggered' | 'refreshing' | 'done'

export function usePullToRefresh(onRefresh: () => void) {
  const startY       = useRef(0)
  const active       = useRef(false)
  const [pullY,      setPullY]  = useState(0)
  const [pullState,  setPullState] = useState<PullState>('idle')
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const endRefresh = useCallback(() => {
    setPullState('done')
    setTimeout(() => {
      setPullState('idle')
      setPullY(0)
    }, 400)
  }, [])

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (document.documentElement.scrollTop > 0) return
      if (pullState === 'refreshing') return
      startY.current = e.touches[0].clientY
      active.current = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return
      const raw = e.touches[0].clientY - startY.current
      if (raw < 0) { active.current = false; return }
      // ゴムひも抵抗
      const dy = Math.min(raw * RESISTANCE, MAX_PULL)
      setPullY(dy)
      setPullState(dy >= THRESHOLD ? 'triggered' : 'pulling')
    }

    function onTouchEnd() {
      if (!active.current) return
      active.current = false
      if (pullY >= THRESHOLD) {
        try { navigator.vibrate(22) } catch (_) {}
        setPullState('refreshing')
        setPullY(THRESHOLD * 0.75) // スナップして固定
        onRefreshRef.current()
        // 1.2秒後に自動で閉じる（データ取得が早く終わった場合も綺麗に閉じる）
        setTimeout(endRefresh, 1200)
      } else {
        setPullState('idle')
        setPullY(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove',  onTouchMove,  { passive: true })
    window.addEventListener('touchend',   onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
    }
  }, [pullY, pullState, endRefresh])

  return { pullY, pullState }
}
