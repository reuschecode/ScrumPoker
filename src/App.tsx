import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { Home } from '@/ui/pages/Home'
import { TablePage } from '@/ui/pages/TablePage'
import { Toaster } from '@/ui/toast/Toaster'

export function App() {
  const location = useLocation()
  // La clave distingue páginas, no parámetros: cambiar de código no remonta la mesa (TablePage
  // gestiona el cambio de código por sí misma).
  const pageKey = location.pathname.startsWith('/t/') ? '/t' : '/'

  return (
    // reducedMotion="user": sin desplazamientos ni escalas si el sistema pide reducir movimiento.
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <Routes location={location} key={pageKey}>
          <Route path="/" element={<Home />} />
          <Route path="/t/:code" element={<TablePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      <Toaster />
    </MotionConfig>
  )
}
