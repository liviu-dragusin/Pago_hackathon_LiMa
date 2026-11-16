import { createContext, useCallback, useContext, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { category } from '../lib/format'

export function Card({ className = '', children }) {
  return <div className={`rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow)] ${className}`}>{children}</div>
}

export function CardTitle({ children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-800">{children}</h2>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function CategoryIcon({ cat, size = 'md' }) {
  const { icon: Icon, color } = category(cat)
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-xl`} style={{ backgroundColor: color + '1f', color }}>
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </span>
  )
}

const STATUS = {
  paid: ['Plătită', 'bg-emerald-50 text-emerald-700'],
  unpaid: ['De plată', 'bg-amber-50 text-amber-700'],
  overdue: ['Restantă', 'bg-red-50 text-red-700'],
}

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] ?? [status, 'bg-slate-100 text-slate-600']
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function Button({ variant = 'primary', loading, className = '', children, ...props }) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-600/90 disabled:bg-brand-300',
    secondary: 'bg-surface text-slate-700 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-brand-700 hover:bg-brand-50',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function ProgressBar({ value, color = 'var(--color-brand-600)', className = '' }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex h-64 items-center justify-center text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

export function ErrorBox({ error }) {
  return (
    <Card className="border-red-200 bg-red-50 text-red-800">
      <p className="font-medium">Nu am putut încărca datele.</p>
      <p className="mt-1 text-sm">{error?.message}</p>
      <p className="mt-2 text-xs text-red-600">Verifică că Apache rulează și că http://localhost/pago/api/ răspunde.</p>
    </Card>
  )
}

// ---------------------------------------------------------------- toast

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, type = 'success') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.type === 'error' ? 'bg-[#c2413a] text-white' : 'bg-ink text-surface'
            }`}
          >
            {t.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
