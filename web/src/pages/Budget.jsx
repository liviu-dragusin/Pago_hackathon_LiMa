import { useState } from 'react'
import { AlertTriangle, Pencil, Sparkles, Thermometer } from 'lucide-react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
  // implicit arătăm primul cont la care vremea contează (ex. gazul)
  const account =
    data.accounts.find((a) => a.account_id === accountId) ?? data.accounts.find((a) => a.weather) ?? data.accounts[0]
  const wx = data.weather_next

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buget & Predicții"
        subtitle={`Estimăm facturile din ${monthLabel(data.period_next, { month: 'long', year: 'numeric' })} din istoricul tău și din vremea estimată (gaz, întreținere), plus sezonalitate și trend.`}
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
        {wx && (
          <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-slate-600">
            <Thermometer className="h-4 w-4 text-[var(--accent)]" />
            <span>
              {monthLabel(wx.period, { month: 'long' })}: în medie <b className="tabular-nums">{formatTemp(wx.temp)}</b>
              {wx.county === 'B' ? ' în București' : ` în județul ${wx.county}`}
            </span>
            <span className="text-xs text-slate-400">({wx.source}, date Open-Meteo)</span>
          </p>
        )}
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

      {account.weather ? (
        <WeatherPanel key={account.account_id} account={account} />
      ) : (
        ['energie', 'gaz', 'intretinere'].includes(account.category) && (
          <p className="rounded-[18px] border border-dashed border-slate-300 px-5 py-4 text-sm text-slate-500">
            Pentru {account.provider}, temperatura nu explică bine factura (de exemplu, curentul crește și vara, de la aerul
            condiționat), așa că folosim istoricul facturilor (regresie liniară sau sezonalitate).
          </p>
        )
      )}
    </div>
  )
}

const formatTemp = (t) => `${t.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} °C`

/** Factura estimată pentru o lună cu temperatura medie T: bază + cost/grad-zi × zile × max(0, 18 − T). */
const amountAt = (model, temp, days) => model.base + model.per_hdd * days * Math.max(0, model.base_temp - temp)

function WeatherPanel({ account }) {
  const { colors } = useTheme()
  const { model, next, points } = account.weather
  const [temp, setTemp] = useState(next.temp)
  const days = next.days

  const atTemp = amountAt(model, temp, days)
  const at10 = amountAt(model, 10, 30)
  const at0 = amountAt(model, 0, 30)
  const perDegree = model.per_hdd * days // lei în plus pentru fiecare grad mai rece (sub 18 °C)

  const curve = Array.from({ length: 41 }, (_, i) => -15 + i).map((t) => ({ temp: t, model: Math.round(amountAt(model, t, 30.4)) }))
  const scatter = points.map((p) => ({ temp: p.temp, amount: p.amount_today, period: p.period }))

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Cum influențează vremea factura de {account.provider}</CardTitle>
          <p className="-mt-2 text-sm text-slate-500">
            Am comparat fiecare factură cu temperatura din luna respectivă. Cu cât e mai frig, cu atât crește consumul de încălzire.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" title="R²: cât din variația facturii explică temperatura">
          Precizie {Math.round(model.r2 * 100)}%
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart margin={{ left: -6, right: 12, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="temp"
                type="number"
                domain={[-15, 25]}
                ticks={[-15, -10, -5, 0, 5, 10, 15, 20, 25]}
                tickFormatter={(t) => `${t}°`}
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v, n) => [ron(v), n === 'model' ? 'Model' : 'Factură (preț de azi)']}
                labelFormatter={(t) => `Temperatură medie ${t} °C`}
              />
              <Line data={curve} dataKey="model" stroke={colors.accent} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Scatter data={scatter} dataKey="amount" fill={account.color} />
              <ReferenceDot x={temp} y={Math.round(atTemp)} r={7} fill={colors.accent} stroke="var(--surface)" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-1 text-center text-xs text-slate-500">
            Puncte: facturile tale (aduse la prețul de azi) · Linia: modelul · Cercul: temperatura aleasă
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-[18px] bg-surface-2 p-4">
            <p className="text-sm font-semibold">Calculator: dacă luna are…</p>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tabular-nums text-[var(--accent)]">{formatTemp(temp)}</span>
              <span className="text-xs text-slate-500">temperatură medie</span>
            </div>
            <input
              type="range"
              min={-15}
              max={25}
              step={0.1}
              value={temp}
              onChange={(e) => setTemp(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
              aria-label="Temperatura medie a lunii"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>−15 °C</span>
              <span>25 °C</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">…estimăm o factură de</p>
            <p className="text-2xl font-bold tabular-nums">{ron(atTemp)}</p>
            <button
              type="button"
              onClick={() => setTemp(next.temp)}
              className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
            >
              Folosește vremea estimată pentru {monthLabel(next.period, { month: 'long' })} ({formatTemp(next.temp)})
            </button>
          </div>

          <div className="rounded-[18px] border border-line p-4 text-sm">
            <p className="font-semibold">Exemplu</p>
            <p className="mt-1 text-slate-600">
              Într-o lună cu <b>10 °C</b> plătești ~<b className="tabular-nums">{ron(at10)}</b>. La <b>0 °C</b>, estimăm ~
              <b className="tabular-nums">{ron(at0)}</b> (+{Math.round((at0 / at10 - 1) * 100)}%).
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[14px] border border-line p-3">
              <dt className="text-xs text-slate-500">Bază (fără încălzire)</dt>
              <dd className="font-semibold tabular-nums">{ron(model.base)}/lună</dd>
            </div>
            <div className="rounded-[14px] border border-line p-3">
              <dt className="text-xs text-slate-500">Fiecare grad mai rece</dt>
              <dd className="font-semibold tabular-nums">+{ron(perDegree)}/lună</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400">
            Încălzirea pornește sub {model.base_temp} °C. Model antrenat pe {model.samples} luni; luna cu anomalie e exclusă.
          </p>
        </div>
      </div>
    </Card>
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
