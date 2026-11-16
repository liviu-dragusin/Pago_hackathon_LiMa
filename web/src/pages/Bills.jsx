import { useMemo, useState } from 'react'
import BillRow, { usePayBill } from '../components/BillRow'
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui'
import { api, useApi } from '../lib/api'
import { CATEGORIES, ron } from '../lib/format'

const TABS = [
  { key: 'all', label: 'Toate' },
  { key: 'unpaid', label: 'De plată' },
  { key: 'overdue', label: 'Restante' },
  { key: 'paid', label: 'Plătite' },
]

export default function Bills() {
  const { data: bills, loading, error, reload } = useApi(api.bills)
  const { pay, payingId } = usePayBill(reload)
  const [tab, setTab] = useState('all')
  const [cat, setCat] = useState('')

  const filtered = useMemo(
    () => (bills ?? []).filter((b) => (tab === 'all' || b.status === tab) && (!cat || b.category === cat)),
    [bills, tab, cat],
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const count = (k) => (k === 'all' ? bills.length : bills.filter((b) => b.status === k).length)

  return (
    <div>
      <PageHeader title="Facturi" subtitle={`${filtered.length} facturi · total ${ron(filtered.reduce((s, b) => s + b.amount, 0))}`}>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm"
        >
          <option value="">Toate categoriile</option>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
      </PageHeader>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key ? 'bg-brand-600 text-white' : 'bg-surface text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label} <span className="opacity-70">{count(t.key)}</span>
          </button>
        ))}
      </div>

      <Card className="py-2">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Nicio factură aici.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((b) => (
              <BillRow key={b.id} bill={b} onPay={pay} paying={payingId === b.id} showPeriod />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
