import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import { ToastProvider } from './components/ui'
import { ThemeProvider } from './lib/theme'
import Dashboard from './pages/Dashboard'
import Bills from './pages/Bills'
import Budget from './pages/Budget'
import Split from './pages/Split'
import Rewards from './pages/Rewards'
import { ProviderMapPage } from './modules/provider-map'
import { GmailImportPage } from './modules/gmail-import'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="facturi" element={<Bills />} />
            <Route path="buget" element={<Budget />} />
            <Route path="split" element={<Split />} />
            <Route path="recompense" element={<Rewards />} />
            <Route path="furnizori" element={<ProviderMapPage />} />
            <Route path="importa" element={<GmailImportPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
