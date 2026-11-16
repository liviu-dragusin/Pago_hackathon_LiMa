import { useState } from 'react'
import { AlertTriangle, Pencil, Sparkles } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, CardTitle, CategoryIcon, ErrorBox, Loading, PageHeader, ProgressBar, useToast } from '../components/ui'
import { api, useApi } from '../lib/api'
import { category, monthLabel, ron } from '../lib/format'
import { useTheme } from '../lib/theme'

export default function Budget() {
  const { data, loading, error, reload } = useApi(api.predictions)
  const [accountId, setAccountId] = useState(null)

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const over = data.total_predicted > data.total_budget
  const account = data.accounts.find((a) => a.account_id === accountId) ?? data.accounts[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buget & Predicții"
        subtitle={`Estimăm facturile din ${monthLabel(data.period_next, { month: 'long', year: 'numeric' })} din istoricul tău (sezonalitate + trend).`}
      />

      <Card className={over ? 'border-red-200' : 'border-emerald-200'}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">Total estimat luna viitoare</p>
            <p className="text-3xl font-bold tabular-nums">{ron(data.total_predicted)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Buget lunar</p>
            <p className="text-xl font-semibold tabular-nums">{ron(data.total_budget)}</p>
            <p className={`text-sm font-medium ${over ? 'text-red-600' : 'text-emerald-600'}`}>
              {over ? `Depășire estimată ${ron(data.total_predicted - data.total_budget)}` : `Rămân ${ron(data.total_budget - data.total_predicted)}`}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.categories.map((c) => (
          <CategoryBudget key={c.category} item={c} anomaly={data.anomalies.find((a) => a.category === c.category)} onSaved={reload} />
        ))}
      </div>

      <Card>
        <CardTitle>Istoric și predicție pe furnizor</CardTitle>
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {data.accounts.map((a) => (
            <button
              key={a.account_id}
              onClick={() => setAccountId(a.account_id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                a.account_id === account.account_id ? 'bg-ink text-surface' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {a.provider}
            </button>
          ))}
        </div>
        <AccountChart account={account} />
      </Card>
    </div>
  )
}

function CategoryBudget({ item, anomaly, onSaved }) {
  const toast = useToast()
  const { colors } = useTheme()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.monthly_limit)
  const [saving, setSaving] = useState(false)
  const { label, color } = category(item.category)
  const pct = item.monthly_limit ? (item.spent_current / item.monthly_limit) * 100 : 0
  const predictedOver = item.predicted_next > item.monthly_limit

  async function save() {
    setSaving(true)
    try {
      await api.updateBudget(item.category, Number(value))
      toast(`Buget ${label} actualizat`)
      setEditing(false)
      await onSaved()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <CategoryIcon cat={item.category} size="sm" />
        <p className="flex-1 font-medium">{label}</p>
        {anomaly && (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" /> +{anomaly.pct}%
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="text-slate-500">Luna asta</span>
        <span className="tabular-nums">
          <span className="font-semibold">{ron(item.spent_current)}</span>
          <span className="text-slate-400"> / </span>
          {editing ? (
            <input
              type="number"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="w-24 rounded-lg border border-slate-300 px-2 py-0.5 text-right"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600">
              {ron(item.monthly_limit)} <Pencil className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <ProgressBar value={pct} color={pct > 100 ? colors.danger : color} className="mt-2" />

      {editing ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Anulează
          </Button>
          <Button onClick={save} loading={saving}>
            Salvează
          </Button>
        </div>
      ) : (
        <p className={`mt-3 text-xs ${predictedOver ? 'font-medium text-red-600' : 'text-slate-500'}`}>
          Estimare luna viitoare: {ron(item.predicted_next)}
          {predictedOver && ' · peste buget'}
        </p>
      )}
    </Card>
  )
}

function AccountChart({ account }) {
  const { colors } = useTheme()
  const { prediction, history } = account
  const last = history[history.length - 1]
  const data = [
    ...history.map((h) => ({ period: h.period, amount: h.amount })),
    { period: prediction.period, predicted: prediction.amount },
  ]
  data[history.length - 1].predicted = last.amount // leagă linia de predicție de ultima valoare reală

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Estimare {monthLabel(prediction.period, { month: 'long' })}: <b className="tabular-nums">{ron(prediction.amount)}</b>
        </span>
        <span className="text-slate-500">
          interval {ron(prediction.low)} – {ron(prediction.high)} · model {prediction.method}
          {prediction.trend !== 1 && ` · trend ${prediction.trend > 1 ? '+' : ''}${((prediction.trend - 1) * 100).toFixed(1)}%`}
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="period" tickFormatter={(p) => monthLabel(p, { month: 'short' })} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v, n) => [ron(v), n === 'amount' ? 'Factură' : 'Estimare']} labelFormatter={(p) => monthLabel(p, { month: 'long', year: 'numeric' })} />
            <ReferenceArea x1={prediction.period} x2={prediction.period} y1={prediction.low} y2={prediction.high} fill={colors.accent} fillOpacity={0.12} />
            <Line dataKey="amount" stroke={account.color} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line dataKey="predicted" stroke={colors.accent} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
