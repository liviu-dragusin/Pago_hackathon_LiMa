import { NavLink, Outlet } from 'react-router-dom'
import { Home, LogOut, MapPinPlus, Moon, PieChart, Receipt, Sun, Users } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../modules/auth'
import { Assistant } from '../modules/assistant'

const NAV = [
  { to: '/', label: 'Acasă', icon: Home, end: true },
  { to: '/facturi', label: 'Facturi', icon: Receipt },
  { to: '/furnizori', label: 'Adaugă furnizor', short: 'Furnizori', icon: MapPinPlus },
  { to: '/buget', label: 'Buget & Predicții', short: 'Buget', icon: PieChart },
  { to: '/split', label: 'Plăți split', short: 'Split', icon: Users },
]

export default function Layout() {
  return (
    <div className="min-h-screen lg:pl-64">
      <Assistant />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-surface px-4 py-6 lg:flex">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <UserBox />
          <ThemeToggle wide />
          <div className="rounded-xl bg-brand-50 p-4 text-xs text-brand-900">
            <p className="font-semibold">Hackathon Pago 2026</p>
            <p className="mt-1 text-brand-700">Echipa LiMa · MVP</p>
          </div>
        </div>
      </aside>

      {/* Header mobil */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
        <Outlet />
        <footer className="mt-10 border-t border-[var(--line)] pt-4 text-center text-xs text-[var(--muted)]">Făcut la Pago</footer>
      </main>

      {/* Bottom nav mobil */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-slate-200 bg-surface lg:hidden"
        style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}
      >
        {NAV.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`
            }
          >
            <Icon className="h-5 w-5" />
            <span className="w-full truncate text-center">{short ?? label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function UserBox() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{user.email}</p>
        <p className="text-[11px] text-slate-500">{user.demo ? 'Cont demo' : 'Conectat cu Gmail'}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        aria-label="Deconectare"
        title="Deconectare"
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}

function LogoutButton() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <button
      type="button"
      onClick={logout}
      aria-label="Deconectare"
      title="Deconectare"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
    >
      <LogOut className="h-5 w-5" />
    </button>
  )
}

function ThemeToggle({ wide = false }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const Icon = dark ? Sun : Moon
  const label = dark ? 'Temă deschisă' : 'Temă închisă'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex items-center gap-3 rounded-xl text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 ${
        wide ? 'w-full px-3 py-2.5' : 'h-9 w-9 justify-center'
      }`}
    >
      <Icon className="h-5 w-5" />
      {wide && label}
    </button>
  )
}

// Masthead după DESIGN.md: „pago” în accent, separator, „AI Hackathon · LiMa” discret.
function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="text-lg font-bold lowercase text-[var(--accent)]">pago</span>
      <span className="h-5 w-px bg-[var(--line)]" />
      <span className="text-xs text-[var(--muted)]">AI Hackathon · LiMa</span>
    </div>
  )
}
