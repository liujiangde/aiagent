"use client"
import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
import { ConfigProvider, theme } from "antd"
import { StyleProvider } from "@ant-design/cssinjs"

type ThemeState = {
  dark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("ThemeContext not found")
  return ctx
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("__theme_dark__")
    if (stored === "true") setDark(true)
    else if (stored === "false") setDark(false)
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true)
  }, [])

  const value = useMemo<ThemeState>(() => ({
    dark,
    toggle: () => {
      setDark(prev => {
        const next = !prev
        localStorage.setItem("__theme_dark__", String(next))
        return next
      })
    }
  }), [dark])

  return (
    <StyleProvider hashPriority="high">
      <ThemeContext.Provider value={value}>
        <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
          <>{children}</>
        </ConfigProvider>
      </ThemeContext.Provider>
    </StyleProvider>
  )
}