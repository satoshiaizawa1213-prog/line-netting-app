import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'
const DEFAULT_THEME: Theme = 'dark'

/** localStorage からテーマを取得。なければデフォルト */
export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // localStorage アクセス失敗時はデフォルト
  }
  return DEFAULT_THEME
}

/** <html> 要素に data-theme を設定（CSS のテーマ切り替えトリガー） */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

/** React のフック — 状態変化を localStorage と HTML 属性に反映 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // 保存失敗は無視
    }
  }, [theme])

  return [theme, setThemeState]
}

/** アプリ起動時の最初の paint 前にテーマを適用するためのヘルパー
 *  (main.tsx の bootstrap 開始時に呼ぶ) */
export function applyInitialTheme() {
  applyTheme(getInitialTheme())
}
