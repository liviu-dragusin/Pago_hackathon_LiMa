import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { category } from '../../lib/format'

/**
 * mode = 'account'  → conectează un cont existent (cod client) ca să plătești facturile în aplicație
 * mode = 'contract' → cerere de contract nou la furnizor, pe adresa din județul ales
 */
export default function AddProviderDialog({ provider, mode, county, catalog, defaultCategory, userName, onClose, onDone }) {
  const toast = useToast()
  const contractCats = provider.categories.filter((c) => catalog.categories.find((k) => k.key === c)?.contract)
  const allowedCats = mode === 'contract' ? contractCats : provider.categories
  const [form, setForm] = useState({
    category: allowedCats.includes(defaultCategory) ? defaultCategory : allowedCats[0],
    client_code: '',
    alias: '',
    locality: '',
    address: '',
    full_name: userName ?? '',
    phone: '',
    notes: '',
  })
  const [localities, setLocalities] = useState([])
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (mode === 'contract') api.localities(county.code).then(setLocalities).catch(() => setLocalities([]))
  }, [mode, county.code])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { ...form, slug: provider.slug, county: county.code }
      const res = mode === 'account' ? await api.addAccount(body) : await api.createContract(body)
      toast(
        mode === 'account'
          ? `${provider.name} adăugat · +${res.points_awarded} puncte`
          : `Cerere de contract trimisă la ${provider.name} · +${res.points_awarded} puncte`,
      )
      res.new_badges?.forEach((b) => toast(`Badge nou: ${b.name}!`))
      onDone()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-6 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
              {mode === 'account' ? 'Adaugă cont pentru plată' : 'Cerere contract nou'}
            </p>
            <h2 className="mt-1 text-lg font-bold">{provider.name}</h2>
            <p className="text-sm text-slate-500">Județul {county.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {allowedCats.length > 1 && (
            <Field label="Serviciu">
              <div className="flex flex-wrap gap-2">
                {allowedCats.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
                      form.category === c ? 'bg-brand-600 text-white ring-brand-600' : 'text-slate-600 ring-slate-200'
                    }`}
                  >
                    {category(c).label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {mode === 'account' ? (
            <>
              <Field label="Cod client / cod abonat" hint="Îl găsești pe factură, de obicei sus, lângă numele tău.">
                <input required minLength={4} value={form.client_code} onChange={set('client_code')} className={input} placeholder="ex. 1234567890" />
              </Field>
              <Field label="Nume cont (opțional)">
                <input value={form.alias} onChange={set('alias')} className={input} placeholder="ex. Apartament părinți" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Localitate">
                <select required value={form.locality} onChange={set('locality')} className={input}>
                  <option value="">{localities.length ? 'Alege localitatea…' : 'Se încarcă…'}</option>
                  {localities.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Adresa locului de consum">
                <input required value={form.address} onChange={set('address')} className={input} placeholder="Strada, nr., bloc, ap." />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nume complet">
                  <input required value={form.full_name} onChange={set('full_name')} className={input} />
                </Field>
                <Field label="Telefon">
                  <input required value={form.phone} onChange={set('phone')} className={input} placeholder="07xx xxx xxx" />
                </Field>
              </div>
              <Field label="Detalii (opțional)">
                <textarea rows={2} value={form.notes} onChange={set('notes')} className={input} placeholder="ex. mutare, branșament nou, tip abonament dorit" />
              </Field>
            </>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" className="flex-1" loading={saving}>
            {mode === 'account' ? 'Adaugă furnizor' : 'Trimite cererea'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}
