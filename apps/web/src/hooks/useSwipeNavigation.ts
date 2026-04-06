import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const H_THRESHOLD = 80   // この距離以上で「戻る」確定 (px)
const V_LIMIT     = 40   // 縦移動がこれ以上なら水平スワイプとみなさない (px)
const EDGE_WIDTH  = 44   // 左端からこの幅内で始まったスワイプのみ有効 (px)

export function useSwipeNavigation() {
  const navigate  = useNavigate()
  const { pathname } = useLocation()
  const startX    = useRef(0)
  const startY    = useRef(0)
  const active    = useRef(false)

  useEffect(() => {
    function getPage(): HTMLElement | null {
      return document.querySelector<HTMLElement>('.page')
    }

    function setTransform(el: HTMLElement, x: number, transition = '') {
      el.style.transition = transition
      el.style.transform  = x === 0 ? '' : `translateX(${x}px)`
    }

    function onTouchStart(e: TouchEvent) {
      if (pathname === '/') return
      if (e.touches[0].clientX > EDGE_WIDTH) return
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
      active.current = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return
      const dx = e.touches[0].clientX - startX.current
      const dy = Math.abs(e.touches[0].clientY - startY.current)
      if (dy > V_LIMIT) { active.current = false; return }
      if (dx <= 0) return
      const el = getPage()
      if (el) setTransform(el, dx)
    }

    function onTouchEnd(e: TouchEvent) {
      if (!active.current) return
      active.current = false
      const dx = e.changedTouches[0].clientX - startX.current
      const el = getPage()
      if (!el) return

      if (dx >= H_THRESHOLD) {
        // 確定: 画面外までスライドアウトしてから遷移
        const W = window.innerWidth
        setTransform(el, W, 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)')
        try { navigator.vibrate(30) } catch (_) {}
        setTimeout(() => {
          navigate(-1)
          // 遷移後の新しいページにスライドイン演出
          requestAnimationFrame(() => {
            const next = getPage()
            if (next) next.classList.add('page-enter')
            setTimeout(() => next?.classList.remove('page-enter'), 300)
          })
        }, 220)
      } else {
        // キャンセル: 元の位置に戻す
        setTransform(el, 0, 'transform 0.2s cubic-bezier(0.25,0.46,0.45,0.94)')
        setTimeout(() => { el.style.transition = '' }, 200)
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
  }, [navigate])
}
