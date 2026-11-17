import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import { ToastProvider } from './components/ui'
import { ThemeProvider } from './lib/theme'
import Dashboard from './pages/Dashboard'
import Bills from './pages/Bills'
import Budget from './pages/Budget'
import Split from './pages/Split'
import { ProviderMapPage } from './modules/provider-map'
import { AuthGate } from './modules/auth'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <ToastProvider>
      <BrowserRouter>
        <AuthGate>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="facturi" element={<Bills />} />
            <Route path="buget" element={<Budget />} />
            <Route path="split" element={<Split />} />
            <Route path="furnizori" element={<ProviderMapPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthGate>
      </BrowserRouter>
    </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
