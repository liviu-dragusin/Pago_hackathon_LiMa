import { useState } from 'react'
import { Check, HandCoins } from 'lucide-react'
import { Button, Card, CardTitle, CategoryIcon, ErrorBox, Loading, PageHeader, useToast } from '../components/ui'
import { api, useApi } from '../lib/api'
import { monthLabel, ron, shortDate } from '../lib/format'

export default function Split() {
  const { data, loading, error, setData } = useApi(api.splits)

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-6">
      <PageHeader title="Plăți split" subtitle="Plătești tu factura, iar colegii îți dau partea lor. Ținem noi socoteala." />
      {data.groups.map((g) => (
        <Group key={g.id} group={g} splittable={data.splittable_bills} onChange={setData} />
      ))}
    </div>
  )
}

function Group({ group, splittable, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)

  async function settle(share) {
    setBusy(share.id)
    try {
      onChange(await api.settleShare(share.id))
      toast(`${share.member} a decontat ${ron(share.amount)}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6">
        <Card>
          <CardTitle>{group.name}</CardTitle>
          <div className="rounded-xl bg-brand-50 p-4">
            <p className="text-sm text-brand-700">Ți se datorează</p>
            <p className="text-3xl font-bold text-brand-900 tabular-nums">{ron(group.owed_to_me)}</p>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {m.name[0]}
                </span>
                <span className="flex-1 text-sm font-medium">{m.name}</span>
                {!m.is_owner && (
                  <span className={`text-sm tabular-nums ${m.owes > 0 ? 'font-semibold text-amber-700' : 'text-emerald-600'}`}>
                    {m.owes > 0 ? `datorează ${ron(m.owes)}` : 'la zi'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <SplitForm group={group} bills={splittable} onDone={onChange} />
      </div>

      <Card className="xl:col-span-2">
        <CardTitle>Facturi împărțite</CardTitle>
        <div className="space-y-4">
          {group.bills.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <CategoryIcon cat={b.category} size="sm" />
                <div className="flex-1">
                  <p className="font-medium">{b.provider}</p>
                  <p className="text-xs text-slate-500">{monthLabel(b.period, { month: 'long', year: 'numeric' })}</p>
                </div>
                <p className="font-semibold tabular-nums">{ron(b.amount)}</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {b.shares.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{s.member}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{ron(s.amount)}</p>
                    </div>
                    {s.settled_at ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600" title={`Decontat ${shortDate(s.settled_at)}`}>
                        <Check className="h-4 w-4" /> achitat
                      </span>
                    ) : (
                      <Button variant="ghost" className="px-2 py-1 text-xs" loading={busy === s.id} onClick={() => settle(s)}>
                        <HandCoins className="h-3.5 w-3.5" /> Încasat
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function SplitForm({ group, bills, onDone }) {
  const toast = useToast()
  const others = group.members.filter((m) => !m.is_owner)
  const [billId, setBillId] = useState('')
  const [members, setMembers] = useState(others.map((m) => m.id))
  const [saving, setSaving] = useState(false)

  const bill = bills.find((b) => b.id === Number(billId))
  const share = bill ? bill.amount / (members.length + 1) : 0

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.splitBill(group.id, Number(billId), members)
      toast(`${bill.provider} împărțită în ${members.length + 1}`)
      setBillId('')
      onDone(res)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id) => setMembers((ms) => (ms.includes(id) ? ms.filter((x) => x !== id) : [...ms, id]))

  return (
    <Card>
      <CardTitle>Împarte o factură</CardTitle>
      <form onSubmit={submit} className="space-y-4">
        <select
          required
          value={billId}
          onChange={(e) => setBillId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm"
        >
          <option value="">Alege factura…</option>
          {bills.map((b) => (
            <option key={b.id} value={b.id}>
              {b.provider} · {monthLabel(b.period, { month: 'short' })} · {ron(b.amount)}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {others.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 ${
                members.includes(m.id) ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'text-slate-600 ring-slate-200'
              }`}
            >
              <input type="checkbox" className="hidden" checked={members.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.name}
            </label>
          ))}
        </div>
        {bill && members.length > 0 && (
          <p className="text-sm text-slate-500">
            {members.length + 1} persoane × <b className="text-slate-800">{ron(share)}</b>
          </p>
        )}
        <Button type="submit" className="w-full" loading={saving} disabled={!billId || members.length === 0}>
          Împarte egal
        </Button>
      </form>
    </Card>
  )
}
