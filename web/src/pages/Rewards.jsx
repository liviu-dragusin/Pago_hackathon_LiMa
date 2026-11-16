import { Clock, Flame, Heart, Lock, Medal, Rocket, Sunrise, Trophy, Users } from 'lucide-react'
import { Card, CardTitle, ErrorBox, Loading, PageHeader, ProgressBar } from '../components/ui'
import { api, useApi } from '../lib/api'
import { shortDate } from '../lib/format'

const BADGE_ICONS = { rocket: Rocket, clock: Clock, sunrise: Sunrise, flame: Flame, users: Users, medal: Medal, heart: Heart }

export default function Rewards() {
  const { data, loading, error } = useApi(api.rewards)

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const { points, level, streak, levels, badges, ledger, rules } = data

  return (
    <div className="space-y-6">
      <PageHeader title="Recompense" subtitle="Plătește la timp, împarte facturi și urcă de nivel." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-[linear-gradient(160deg,var(--poster-a),var(--poster-b))] p-6 text-white shadow-lg lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/80">Nivelul tău</p>
            <Trophy className="h-6 w-6 text-amber-300" />
          </div>
          <p className="mt-1 text-4xl font-bold">{level.name}</p>
          <p className="mt-1 text-white/80">{points.toLocaleString('ro-RO')} puncte</p>
          <ProgressBar value={level.progress} color="#fcd34d" className="mt-5 bg-white/20" />
          <div className="mt-2 flex justify-between text-xs text-white/80">
            {levels.map((l) => (
              <span key={l.name} className={l.name === level.name ? 'font-semibold text-white' : ''}>
                {l.name}
              </span>
            ))}
          </div>
          {level.next && (
            <p className="mt-4 text-sm">
              Încă <b>{level.to_next} puncte</b> până la {level.next}.
            </p>
          )}
        </div>

        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <p className="text-3xl font-bold">{streak}</p>
              <p className="text-sm text-slate-500">plăți la timp la rând</p>
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cum câștigi puncte</p>
            {rules.map((r) => (
              <div key={r.label} className="flex justify-between text-sm">
                <span className="text-slate-600">{r.label}</span>
                <span className="font-semibold text-brand-600">+{r.points}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Badge-uri</CardTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {badges.map((b) => {
            const Icon = BADGE_ICONS[b.icon] ?? Medal
            const earned = !!b.earned_at
            return (
              <div key={b.code} className={`rounded-2xl p-4 text-center ring-1 ${earned ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200'}`}>
                <span
                  className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                    earned ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {earned ? <Icon className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                </span>
                <p className="mt-2 text-sm font-semibold">{b.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{b.description}</p>
                {!earned && <ProgressBar value={(b.current / b.threshold) * 100} className="mt-2" />}
                <p className="mt-1 text-[11px] text-slate-400">{earned ? `obținut ${shortDate(b.earned_at)}` : `${b.current}/${b.threshold}`}</p>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Istoric puncte</CardTitle>
        <ul className="divide-y divide-slate-100">
          {ledger.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="text-slate-700">{l.reason}</span>
              <span className="flex shrink-0 items-center gap-4">
                <span className="text-xs text-slate-400">{shortDate(l.created_at)}</span>
                <span className="w-12 text-right font-semibold text-emerald-600">+{l.points}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
