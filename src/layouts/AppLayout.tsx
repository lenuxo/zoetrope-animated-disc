import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import type { WorkbenchControls } from '../pages/HomePage'
import type { WorkbenchPlan } from '../simulation/plate'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Disc3 } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { TooltipProvider } from '@/components/ui/tooltip'

const HomePage = lazy(() => import('../pages/HomePage').then(({ HomePage }) => ({ default: HomePage })))

export function AppLayout() {
  const isWorkbench = useLocation().pathname === "/"
  const [visited, setVisited] = useState(isWorkbench)
  const [initialPlan, setInitialPlan] = useState<WorkbenchPlan | null>(null)
  const workbench = useRef<WorkbenchControls>(null)
  if (isWorkbench && !visited) setVisited(true)
  useLayoutEffect(() => {
    if (!isWorkbench) workbench.current?.pause()
  }, [isWorkbench])
  const applyPlan = (plan: WorkbenchPlan) => {
    if (workbench.current) workbench.current.applyPlan(plan)
    else setInitialPlan(plan)
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className={`app-shell ${isWorkbench ? '' : 'content-shell studio-reading'}`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:py-3">跳转到主要内容</a>
        <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b bg-card px-5">
          <NavLink to="/" className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Disc3 className="size-5" /></span><span className="text-base font-semibold tracking-tight">Zoetrope<span className="ml-2 hidden text-sm font-normal text-muted-foreground sm:inline">唱片实验室</span></span></NavLink>
          <div className="flex items-center gap-2 sm:gap-5"><nav aria-label="主导航" className="flex gap-1"><NavLink to="/" end className="nav-link">工作台</NavLink><NavLink to="/design-guide" className="nav-link">设计指南</NavLink><NavLink to="/about" className="nav-link">关于</NavLink></nav><span className="h-5 border-l" /><ThemeToggle /></div>
        </header>
        <main id="main-content" className={isWorkbench ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-auto content-main"}>
          {(isWorkbench || visited) && <div className="workbench-viewport" hidden={!isWorkbench}>
            <Suspense fallback={<p role="status">正在打开工作台…</p>}>
              <HomePage ref={workbench} active={isWorkbench} initialPlan={initialPlan} />
            </Suspense>
          </div>}
          <Suspense fallback={<p role="status">正在打开页面…</p>}><Outlet context={applyPlan} /></Suspense>
        </main>

      </div>
    </TooltipProvider>
  )
}
