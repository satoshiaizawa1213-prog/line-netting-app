import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 64

export function usePullToRefresh(onRefresh: () => void) {
  const startY   = useRef(0)
  const currentY = useRef(0)
  const active   = useRef(false)
  const [pullY,  setPullY]  = useState(0)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (document.documentElement.scrollTop > 0) return
      startY.current  = e.touches[0].clientY
      currentY.current = 0
      active.current  = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy < 0) { active.current = false; setPullY(0); return }
      currentY.current = dy
      setPullY(Math.min(dy, THRESHOLD * 1.5))
    }

    function onTouchEnd() {
      if (!active.current) return
      active.current = false
      const dy = currentY.current
      setPullY(0)
      if (dy >= THRESHOLD) {
        try { navigator.vibrate(60) } catch (_) {}
        onRefreshRef.current()
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
  }, []) // マウント時に1度だけ登録

  const triggered = pullY >= THRESHOLD
  return { pullY, triggered }
}
