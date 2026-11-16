import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Flame, Sparkles, Trophy } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import BillRow, { usePayBill } from '../components/BillRow'
import { Card, CardTitle, ErrorBox, Loading, ProgressBar } from '../components/ui'
import { api, useApi } from '../lib/api'
import { CATEGORIES, monthLabel, ron } from '../lib/format'
import { useTheme } from '../lib/theme'

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(api.dashboard)
  const { pay, payingId } = usePayBill(reload)
  const { colors } = useTheme()

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const { user, summary, upcoming, monthly, prediction, anomalies, rewards } = data
  const chartData = [...monthly, { period: prediction.period, predicted: prediction.total }]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Salut, {user.name.split(' ')[0]}!</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ai {summary.unpaid_count} facturi de plătit în valoare de {ron(summary.to_pay)}.
        </p>
      </div>

      {anomalies.map((a) => (
        <div key={a.account_id} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold">
              Factura {a.provider} e cu {a.pct}% mai mare decât ne așteptam
            </p>
            <p className="mt-0.5 text-amber-800">
              {ron(a.amount)} față de ~{ron(a.expected)} estimat pentru {monthLabel(a.period, { month: 'long' })}. Verifică indexul sau consumul.
            </p>
          </div>
          <Link to="/buget" className="shrink-0 font-medium text-amber-900 underline">
            Detalii
          </Link>
        </div>
      ))}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="De plată" value={ron(summary.to_pay)} hint={`${summary.unpaid_count} facturi`} />
        <Kpi
          label="Restanțe"
          value={ron(summary.overdue_amount)}
          hint={summary.overdue_count ? `${summary.overdue_count} facturi după scadență` : 'Nimic restant'}
          danger={summary.overdue_count > 0}
        />
        <Kpi
          label={`Estimare ${monthLabel(prediction.period, { month: 'long' })}`}
          value={ron(prediction.total)}
          hint={
            prediction.total > prediction.budget
              ? `Peste buget cu ${ron(prediction.total - prediction.budget)}`
              : `Sub buget cu ${ron(prediction.budget - prediction.total)}`
          }
          danger={prediction.total > prediction.budget}
          icon={Sparkles}
        />
        <Link to="/recompense">
          <Card className="h-full transition hover:border-brand-300">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Nivel {rewards.level.name}</p>
              <Trophy className="h-4 w-4 text-brand-500" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{rewards.points.toLocaleString('ro-RO')} pct</p>
            <ProgressBar value={rewards.level.progress} className="mt-3" />
            <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <Flame className="h-3.5 w-3.5 text-orange-500" /> {rewards.streak} plăți la timp la rând
              {rewards.level.next && <> · {rewards.level.to_next} pct până la {rewards.level.next}</>}
            </p>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle>Cheltuieli lunare + estimare</CardTitle>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -10 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="period" tickFormatter={(p) => monthLabel(p, { month: 'short' })} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, name) => [ron(v), CATEGORIES[name]?.label ?? 'Estimare']} labelFormatter={(p) => monthLabel(p, { month: 'long', year: 'numeric' })} />
                <Legend formatter={(name) => CATEGORIES[name]?.label ?? 'Estimare'} wrapperStyle={{ fontSize: 12 }} />
                {Object.entries(CATEGORIES).map(([key, c]) => (
                  <Bar key={key} dataKey={key} stackId="a" fill={c.color} />
                ))}
                <Bar dataKey="predicted" stackId="a" fill={colors.accentSoft} stroke={colors.accent} strokeDasharray="4 3" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle
            action={
              <Link to="/facturi" className="flex items-center gap-1 text-sm font-medium text-brand-600">
                Toate <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            Urmează la plată
          </CardTitle>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Toate facturile sunt plătite 🎉</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcoming.map((b) => (
                <BillRow key={b.id} bill={b} onPay={pay} paying={payingId === b.id} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Kpi({ label, value, hint, danger, icon: Icon }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-brand-500" />}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className={`mt-2 text-xs ${danger ? 'font-medium text-red-600' : 'text-slate-500'}`}>{hint}</p>
    </Card>
  )
}
