import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const H_THRESHOLD = 72    // 戻る確定距離 (px)
const V_LIMIT     = 36    // 縦ズレ許容量 (px)
const EDGE_WIDTH  = 48    // 左端の反応エリア (px)
const RESISTANCE  = 0.92  // ドラッグ抵抗感（1=なし、低いほど重い）

/** スワイプ中に左端に表示する「前の画面」を模した影付きオーバーレイ */
function getOrCreateOverlay(): HTMLDivElement {
  let el = document.getElementById('swipe-overlay') as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = 'swipe-overlay'
    Object.assign(el.style, {
      position:      'fixed',
      inset:         '0',
      zIndex:        '999',
      pointerEvents: 'none',
      opacity:       '0',
      background:    'linear-gradient(to right, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.06) 40%, transparent 100%)',
      transition:    'none',
    })
    document.body.appendChild(el)
  }
  return el
}

function removeOverlay() {
  document.getElementById('swipe-overlay')?.remove()
}

export function useSwipeNavigation() {
  const navigate      = useNavigate()
  const { pathname }  = useLocation()
  const startX        = useRef(0)
  const startY        = useRef(0)
  const active        = useRef(false)
  const confirmed     = useRef(false)

  useEffect(() => {
    function getPage(): HTMLElement | null {
      return document.querySelector<HTMLElement>('.page')
    }

    function applyDrag(el: HTMLElement, rawDx: number) {
      const dx    = rawDx * RESISTANCE
      const ratio = Math.min(dx / window.innerWidth, 1)

      el.style.transition = 'none'
      el.style.transform  = `translateX(${dx}px)`
      el.style.boxShadow  = `-16px 0 40px rgba(0,0,0,${0.15 + ratio * 0.20})`
      el.style.willChange = 'transform'
      el.style.borderRadius = ratio > 0.01 ? '12px 0 0 12px' : ''

      const overlay = getOrCreateOverlay()
      overlay.style.opacity = String(ratio * 0.7)
    }

    function resetPage(el: HTMLElement, animate: boolean) {
      el.style.transition = animate
        ? 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.28s ease, border-radius 0.28s ease'
        : 'none'
      el.style.transform    = ''
      el.style.boxShadow    = ''
      el.style.willChange   = ''
      el.style.borderRadius = ''
      const overlay = getOrCreateOverlay()
      overlay.style.transition = animate ? 'opacity 0.28s ease' : 'none'
      overlay.style.opacity    = '0'
      if (animate) setTimeout(removeOverlay, 300)
      else removeOverlay()
    }

    function slideOut(el: HTMLElement, onDone: () => void) {
      const W = window.innerWidth
      el.style.transition   = 'transform 0.30s cubic-bezier(0.4,0,0.2,1), box-shadow 0.28s ease, border-radius 0.30s ease'
      el.style.transform    = `translateX(${W}px)`
      el.style.boxShadow    = 'none'
      el.style.borderRadius = ''
      const overlay = getOrCreateOverlay()
      overlay.style.transition = 'opacity 0.30s ease'
      overlay.style.opacity    = '0'
      setTimeout(() => {
        removeOverlay()
        onDone()
      }, 300)
    }

    function onTouchStart(e: TouchEvent) {
      if (pathname === '/') return
      if (e.touches[0].clientX > EDGE_WIDTH) return
      startX.current  = e.touches[0].clientX
      startY.current  = e.touches[0].clientY
      active.current  = true
      confirmed.current = false
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return
      const dx = e.touches[0].clientX - startX.current
      const dy = Math.abs(e.touches[0].clientY - startY.current)
      if (dy > V_LIMIT) { active.current = false; return }
      if (dx <= 0) return
      const el = getPage()
      if (!el) return
      applyDrag(el, dx)
      // 確定ラインを超えたら触覚フィードバック
      if (dx >= H_THRESHOLD && !confirmed.current) {
        confirmed.current = true
        try { navigator.vibrate(18) } catch (_) {}
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!active.current) return
      active.current = false
      const dx = e.changedTouches[0].clientX - startX.current
      const el = getPage()
      if (!el) return

      if (dx >= H_THRESHOLD) {
        slideOut(el, () => {
          navigate(-1)
          // 遷移後のページをスライドイン
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const next = getPage()
              if (!next) return
              next.style.transform  = 'translateX(-24px)'
              next.style.opacity    = '0.85'
              next.style.transition = 'none'
              requestAnimationFrame(() => {
                next.style.transition = 'transform 0.26s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.22s ease'
                next.style.transform  = ''
                next.style.opacity    = ''
                setTimeout(() => {
                  next.style.transition = ''
                }, 280)
              })
            })
          })
        })
      } else {
        // キャンセル：元の位置にスプリングで戻す
        resetPage(el, true)
        setTimeout(() => { el.style.transition = '' }, 300)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove',  onTouchMove,  { passive: true })
    window.addEventListener('touchend',   onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
      removeOverlay()
    }
  }, [navigate, pathname])
}
