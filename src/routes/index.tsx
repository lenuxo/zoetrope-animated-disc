import { Route, Routes } from 'react-router'
import { AppLayout } from '../layouts/AppLayout'
import { lazy } from 'react'
import { AboutPage } from '../pages/AboutPage'
import { NotFoundPage } from '../pages/NotFoundPage'

const DesignGuidePage = lazy(() => import('../pages/DesignGuidePage').then(({ DesignGuidePage }) => ({ default: DesignGuidePage })))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={null} />
        <Route path="design-guide" element={<DesignGuidePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
