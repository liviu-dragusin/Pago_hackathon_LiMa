import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'pago-theme'

// Culorile pentru seriile din grafice: atributele SVG nu acceptă var(), deci le dăm ca hex.
// Țineți-le sincronizate cu tokenii din index.css.
export const THEME_COLORS = {
  light: { accent: '#2B59C3', accentSoft: '#B3CCFA', danger: '#DC2626' },
  dark: { accent: '#7FA2F5', accentSoft: '#2F51AD', danger: '#F07A72' },
}

function readStored() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialTheme() {
  const attr = document.documentElement.dataset.theme
  if (attr === 'light' || attr === 'dark') return attr
  return readStored() ?? systemTheme()
}

const ThemeCtx = createContext({ theme: 'light', toggle: () => {}, colors: THEME_COLORS.light })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Cât timp userul nu a ales explicit, urmăm tema sistemului.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e) => {
      if (!readStored()) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // stocare blocată: tema se schimbă doar pentru sesiunea curentă
    }
    setTheme(next)
  }, [])

  return <ThemeCtx.Provider value={{ theme, toggle, colors: THEME_COLORS[theme] }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
