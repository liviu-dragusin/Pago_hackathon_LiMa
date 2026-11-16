import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, Receipt, Search, Users, X } from 'lucide-react'
import { usePayBill } from '../components/BillRow'
import { Button, ErrorBox, Loading } from '../components/ui'
import { api, useApi } from '../lib/api'
import { CATEGORIES, category, dueText, monthLabel, ron } from '../lib/format'
import ProviderLogo from '../modules/provider-map/ProviderLogo'

// Inspirație Dribbble (aplicații de plată facturi): card-sumar mare, plăci de stare colorate,
// control segmentat, filtre ca chip-uri și lista grupată pe luni.

const TABS = [
  { key: 'all', label: 'Toate' },
  { key: 'unpaid', label: 'De plată' },
  { key: 'overdue', label: 'Restante' },
  { key: 'paid', label: 'Plătite' },
]

const isOpen = (b) => b.status === 'unpaid' || b.status === 'overdue'
const sum = (list) => list.reduce((s, b) => s + b.amount, 0)

export default function Bills() {
  const { data: bills, loading, error, reload } = useApi(api.bills)
  const { pay, payingId } = usePayBill(reload)
  // ?status=overdue|unpaid|paid deschide pagina direct pe filtrul respectiv (ex. din asistent)
  const [params] = useSearchParams()
  const statusParam = TABS.some((t) => t.key === params.get('status')) ? params.get('status') : 'all'
  const [tab, setTab] = useState(statusParam)
  const [cat, setCat] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => setTab(statusParam), [statusParam])

  const stats = useMemo(() => {
    const list = bills ?? []
    const open = list.filter(isOpen).sort((a, b) => a.due_date.localeCompare(b.due_date))
    const overdue = list.filter((b) => b.status === 'overdue')
    const soon = list.filter((b) => b.status === 'unpaid' && b.days_left <= 7)
    const period = list.reduce((max, b) => (b.period > max ? b.period : max), '')
    const thisMonth = list.filter((b) => b.period === period)
    const paidThisMonth = thisMonth.filter((b) => b.status === 'paid')
    return { open, overdue, soon, period, thisMonth, paidThisMonth }
  }, [bills])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (bills ?? []).filter(
      (b) =>
        (tab === 'all' || b.status === tab) &&
        (!cat || b.category === cat) &&
        (!q || b.provider.toLowerCase().includes(q) || (b.alias ?? '').toLowerCase().includes(q)),
    )
  }, [bills, tab, cat, query])

  // Grupare pe luni; pentru „De plată” și „Restante” cele mai urgente sunt primele.
  const groups = useMemo(() => {
    const urgentFirst = tab === 'unpaid' || tab === 'overdue'
    const sorted = [...filtered].sort((a, b) =>
      urgentFirst ? a.due_date.localeCompare(b.due_date) : b.period.localeCompare(a.period) || a.due_date.localeCompare(b.due_date),
    )
    const map = new Map()
    for (const b of sorted) {
      if (!map.has(b.period)) map.set(b.period, [])
      map.get(b.period).push(b)
    }
    return [...map.entries()]
  }, [filtered, tab])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const count = (k) => (k === 'all' ? bills.length : bills.filter((b) => b.status === k).length)
  const categoriesInUse = Object.entries(CATEGORIES).filter(([k]) => bills.some((b) => b.category === k))
  const hasFilters = tab !== 'all' || cat || query
  const resetFilters = () => {
    setTab('all')
    setCat('')
    setQuery('')
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Facturi</h1>
          <p className="mt-1 text-sm text-slate-500">Toate facturile tale, într-un singur loc.</p>
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută furnizor…"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-9 text-sm shadow-[var(--shadow)] placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Șterge căutarea"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </header>

      <SummaryHero stats={stats} onPayNext={pay} payingId={payingId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={AlertTriangle}
          tone="red"
          label="Restante"
          value={stats.overdue.length}
          hint={stats.overdue.length ? ron(sum(stats.overdue)) : 'Nimic restant'}
          active={tab === 'overdue'}
          onClick={() => setTab(tab === 'overdue' ? 'all' : 'overdue')}
        />
        <StatTile
          icon={CalendarClock}
          tone="amber"
          label="Scadente în 7 zile"
          value={stats.soon.length}
          hint={stats.soon.length ? ron(sum(stats.soon)) : 'Liniște săptămâna asta'}
          active={tab === 'unpaid'}
          onClick={() => setTab(tab === 'unpaid' ? 'all' : 'unpaid')}
        />
        <StatTile
          icon={CheckCircle2}
          tone="emerald"
          label="Plătite luna aceasta"
          value={`${stats.paidThisMonth.length}/${stats.thisMonth.length}`}
          hint={ron(sum(stats.paidThisMonth))}
          active={tab === 'paid'}
          onClick={() => setTab(tab === 'paid' ? 'all' : 'paid')}
        />
      </div>

      <div className="space-y-3">
        <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-slate-100 p-1 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? 'bg-surface text-ink shadow-[var(--shadow)]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  tab === t.key ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                {count(t.key)}
              </span>
            </button>
          ))}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <CategoryChip active={!cat} onClick={() => setCat('')}>
            Toate categoriile
          </CategoryChip>
          {categoriesInUse.map(([k, c]) => (
            <CategoryChip key={k} active={cat === k} color={c.color} onClick={() => setCat(cat === k ? '' : k)}>
              {c.label}
            </CategoryChip>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState onReset={hasFilters ? resetFilters : null} />
      ) : (
        <div className="space-y-6">
          {groups.map(([period, list]) => (
            <section key={period}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {monthLabel(period, { month: 'long', year: 'numeric' })}
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {list.length} {list.length === 1 ? 'factură' : 'facturi'} · {ron(sum(list))}
                </span>
              </div>
              <div className="overflow-hidden rounded-[18px] border border-line bg-surface shadow-[var(--shadow)]">
                {list.map((b, i) => (
                  <BillItem key={b.id} bill={b} onPay={pay} paying={payingId === b.id} divider={i > 0} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryHero({ stats, onPayNext, payingId }) {
  const next = stats.open[0]
  const total = sum(stats.open)
  const pct = stats.thisMonth.length ? Math.round((stats.paidThisMonth.length * 100) / stats.thisMonth.length) : 0

  return (
    <section
      className="relative overflow-hidden rounded-[28px] p-6 text-white sm:p-7"
      style={{ background: 'linear-gradient(160deg, var(--poster-a), var(--poster-b))' }}
    >
      <div
        className="pointer-events-none absolute -bottom-16 -right-10 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,213,74,.45), transparent 70%)' }}
      />
      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/80">De plătit acum</p>
          <p className="mt-1 text-[clamp(26px,8vw,48px)] font-extrabold leading-none tabular-nums" style={{ color: 'var(--poster-yellow)' }}>
            {ron(total)}
          </p>
          <p className="mt-2 text-sm font-medium text-white/90">
            {stats.open.length === 0
              ? 'Ești la zi cu toate facturile. Bravo!'
              : `${stats.open.length} ${stats.open.length === 1 ? 'factură neplătită' : 'facturi neplătite'}`}
          </p>

          <div className="mt-5 max-w-sm">
            <div className="flex justify-between text-xs text-white/80">
              <span>{monthLabel(stats.period, { month: 'long' })}: plătite {stats.paidThisMonth.length} din {stats.thisMonth.length}</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--poster-yellow)' }} />
            </div>
          </div>
        </div>

        {next && (
          <div className="min-w-0 rounded-[20px] border border-white/30 bg-white/15 p-4 backdrop-blur md:w-72">
            <p className="text-xs font-medium uppercase tracking-wider text-white/70">Următoarea scadență</p>
            <div className="mt-3 flex items-center gap-3">
              <ProviderLogo logo={next.logo} cat={next.category} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{next.provider}</p>
                <p className="text-xs text-white/80">{dueText(next)}</p>
              </div>
              <p className="font-bold tabular-nums">{ron(next.amount)}</p>
            </div>
            <button
              type="button"
              onClick={() => onPayNext(next)}
              disabled={payingId === next.id}
              className="mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-[#161F28] transition hover:brightness-95 disabled:opacity-60"
              style={{ background: 'var(--poster-yellow)' }}
            >
              {payingId === next.id ? 'Se plătește…' : 'Plătește acum'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

const TONES = {
  red: { box: 'bg-red-50 text-red-700', icon: 'text-red-600', ring: 'ring-red-200' },
  amber: { box: 'bg-amber-50 text-amber-800', icon: 'text-amber-600', ring: 'ring-amber-200' },
  emerald: { box: 'bg-emerald-50 text-emerald-700', icon: 'text-emerald-600', ring: 'ring-emerald-200' },
}

function StatTile({ icon: Icon, tone, label, value, hint, active, onClick }) {
  const t = TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-4 rounded-[18px] p-4 text-left transition hover:-translate-y-0.5 ${t.box} ${
        active ? `ring-2 ${t.ring}` : ''
      }`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-surface/70">
        <Icon className={`h-6 w-6 ${t.icon}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium opacity-90">{label}</span>
        <span className="block text-2xl font-bold leading-tight tabular-nums">{value}</span>
        <span className="block truncate text-xs opacity-80">{hint}</span>
      </span>
    </button>
  )
}

function CategoryChip({ active, color, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active ? 'bg-ink text-surface' : 'bg-surface text-slate-600 ring-1 ring-line hover:bg-slate-50'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}

function DuePill({ bill }) {
  const text = dueText(bill)
  const style =
    bill.status === 'paid'
      ? 'bg-emerald-50 text-emerald-700'
      : bill.status === 'overdue'
        ? 'bg-red-50 text-red-700'
        : bill.days_left <= 3
          ? 'bg-amber-50 text-amber-800'
          : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>{text}</span>
}

function BillItem({ bill, onPay, paying, divider }) {
  const cat = category(bill.category)
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:gap-4 sm:px-5 ${divider ? 'border-t border-line' : ''}`}>
      <ProviderLogo logo={bill.logo} cat={bill.category} className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{bill.provider}</p>
          {bill.is_split && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              <Users className="h-3 w-3" /> split
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <DuePill bill={bill} />
          <span className="truncate text-xs text-slate-500">
            {bill.alias || cat.label}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-right font-bold tabular-nums">{ron(bill.amount)}</p>
        {bill.status === 'paid' ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" title="Plătită">
            <CheckCircle2 className="h-5 w-5" />
          </span>
        ) : (
          <Button onClick={() => onPay(bill)} loading={paying} className="rounded-full">
            Plătește
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onReset }) {
  return (
    <div className="rounded-[18px] border border-dashed border-slate-300 bg-surface px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Receipt className="h-7 w-7" />
      </span>
      <p className="mt-4 font-semibold">Nicio factură aici</p>
      <p className="mt-1 text-sm text-slate-500">
        {onReset ? 'Încearcă alte filtre sau caută alt furnizor.' : 'Când primești facturi noi, le vezi aici.'}
      </p>
      {onReset && (
        <button type="button" onClick={onReset} className="mt-4 text-sm font-semibold text-brand-600 hover:underline">
          Resetează filtrele
        </button>
      )}
    </div>
  )
}
