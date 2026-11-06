import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Theme = 'light' | 'dark'
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem('zoetrope-theme'); if (saved === 'light' || saved === 'dark') return saved } catch { /* Storage can be unavailable in private contexts. */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('zoetrope-theme', theme) } catch { /* Theme still works without persistence. */ }
  }, [theme])
  const label = theme === 'dark' ? '切换浅色主题' : '切换深色主题'
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={label} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun /> : <Moon />}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
