import { useMemo, useState } from 'react'
import { CheckCircle2, FileSignature, Home, MapPin, Plus, Search, Zap } from 'lucide-react'
import { Button, Card, CardTitle, CategoryIcon, ErrorBox, Loading, PageHeader } from '../../components/ui'
import { api, useApi } from '../../lib/api'
import { category, shortDate } from '../../lib/format'
import AddProviderDialog from './AddProviderDialog'
import RomaniaMap from './RomaniaMap'

// Scală secvențială pentru numărul de operatori locali (0 = gri). Valorile sunt în index.css, pe temă.
const SCALE = ['var(--map-1)', 'var(--map-2)', 'var(--map-3)', 'var(--map-4)', 'var(--map-5)']
const NONE = 'var(--map-none)'
const ALL_NATIONAL = 'var(--map-national)'

const CONTRACT_STATUS = {
  trimisa: ['Trimisă', 'bg-slate-100 text-slate-700'],
  in_analiza: ['În analiză', 'bg-amber-50 text-amber-700'],
  aprobata: ['Aprobată', 'bg-emerald-50 text-emerald-700'],
  respinsa: ['Respinsă', 'bg-red-50 text-red-700'],
}

export default function ProviderMapPage() {
  const { data, loading, error, reload } = useApi(api.catalog)
  const [cat, setCat] = useState('')
  const [countyCode, setCountyCode] = useState(null)
  const [query, setQuery] = useState('')
  const [hoverSlug, setHoverSlug] = useState(null)
  const [dialog, setDialog] = useState(null) // {provider, mode}

  const selectedCode = countyCode ?? data?.home_county ?? 'B'

  const view = useMemo(() => {
    if (!data) return null
    const inCat = (p) => !cat || p.categories.includes(cat)
    const providers = data.providers.filter(inCat)
    const onlyNational = providers.every((p) => p.coverage === 'national')

    // Culoare pe județ = câți operatori locali (non-naționali) are categoria aleasă acolo
    const localCount = Object.fromEntries(data.counties.map((c) => [c.code, 0]))
    providers.forEach((p) => p.coverage !== 'national' && p.coverage.forEach((code) => localCount[code]++))
    const max = Math.max(1, ...Object.values(localCount))
    const colors = Object.fromEntries(
      Object.entries(localCount).map(([code, n]) => [
        code,
        onlyNational ? ALL_NATIONAL : n === 0 ? NONE : SCALE[Math.min(SCALE.length - 1, Math.floor(((n - 1) / max) * SCALE.length))],
      ]),
    )

    const q = query.trim().toLowerCase()
    const visible = providers.filter(
      (p) => (p.coverage === 'national' || p.coverage.includes(selectedCode)) && (!q || p.name.toLowerCase().includes(q)),
    )

    return {
      colors,
      onlyNational,
      maxLocal: max,
      county: data.counties.find((c) => c.code === selectedCode),
      local: visible.filter((p) => p.coverage !== 'national'),
      national: visible.filter((p) => p.coverage === 'national'),
      connected: new Set(data.accounts.map((a) => a.slug).filter(Boolean)),
      pending: new Set(data.contracts.filter((c) => ['trimisa', 'in_analiza'].includes(c.status)).map((c) => c.provider_slug)),
    }
  }, [data, cat, query, selectedCode])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const hovered = data.providers.find((p) => p.slug === hoverSlug)
  const highlight = hovered && hovered.coverage !== 'national' ? hovered.coverage : []
  const canContract = (p) => p.categories.some((c) => data.categories.find((k) => k.key === c)?.contract)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adaugă furnizor"
        subtitle="Alege județul pe hartă și vezi furnizorii disponibili în Pago. Conectează un cont existent sau cere un contract nou."
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={!cat} onClick={() => setCat('')}>
          Toate
        </Chip>
        {data.categories.map((c) => (
          <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)} color={category(c.key).color}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="self-start overflow-hidden p-0">
          <div className="aspect-[10/7] w-full p-3">
            <RomaniaMap colors={view.colors} highlight={highlight} selected={selectedCode} home={data.home_county} onSelect={setCountyCode} />
          </div>
          <Legend view={view} cat={cat} hovered={hovered} />
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">
                  {view.county.code === 'B' ? 'Municipiul București' : `Județul ${view.county.name}`}
                </p>
                <p className="text-sm text-slate-500">Regiunea {view.county.region}</p>
              </div>
              {data.home_county && selectedCode !== data.home_county && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setCountyCode(data.home_county)}>
                  <Home className="h-3.5 w-3.5" /> Județul meu
                </Button>
              )}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Distribuitor energie electrică: {view.county.electricity_dso}
            </p>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Caută furnizor…"
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </Card>

          <ProviderSection
            title={`Operatori locali (${view.local.length})`}
            empty={cat && !view.onlyNational ? `Niciun operator local de ${category(cat).label.toLowerCase()} în Pago pentru acest județ.` : null}
            providers={view.local}
            {...{ view, canContract, setHoverSlug, setDialog }}
          />
          <ProviderSection
            title={`Disponibili în toată țara (${view.national.length})`}
            providers={view.national}
            {...{ view, canContract, setHoverSlug, setDialog }}
          />
        </div>
      </div>

      {data.contracts.length > 0 && (
        <Card>
          <CardTitle>Cererile tale de contract</CardTitle>
          <div className="divide-y divide-slate-100">
            {data.contracts.map((c) => {
              const [label, cls] = CONTRACT_STATUS[c.status] ?? [c.status, 'bg-slate-100']
              const county = data.counties.find((k) => k.code === c.county)
              return (
                <div key={c.id} className="flex items-center gap-3 py-3">
                  <CategoryIcon cat={c.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.provider_name} <span className="font-normal text-slate-500">· {category(c.category).label}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {c.locality}, {county?.name} · {c.address} · trimisă {shortDate(c.created_at)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {dialog && (
        <AddProviderDialog
          {...dialog}
          county={view.county}
          catalog={data}
          defaultCategory={cat}
          userName={data.user_name}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function ProviderSection({ title, providers, empty, view, canContract, setHoverSlug, setDialog }) {
  if (!providers.length && !empty) return null
  return (
    <Card className="p-0">
      <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">{title}</p>
      {providers.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
          {providers.map((p) => (
            <li
              key={p.slug}
              onMouseEnter={() => setHoverSlug(p.slug)}
              onMouseLeave={() => setHoverSlug(null)}
              className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
            >
              <CategoryIcon cat={p.categories[0]} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-medium leading-snug">
                  {p.name}
                  {view.connected.has(p.slug) && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" title="Ai deja un cont conectat" />}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {[p.categories.map((c) => category(c).label).join(' + '), p.area ?? p.kind].filter(Boolean).join(' · ')}
                  {view.pending.has(p.slug) && <span className="text-amber-600"> · cerere în curs</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {canContract(p) && (
                  <Button variant="secondary" className="px-2.5 py-1.5" title="Cerere contract nou" onClick={() => setDialog({ provider: p, mode: 'contract' })}>
                    <FileSignature className="h-4 w-4" />
                    <span className="hidden 2xl:inline">Contract</span>
                  </Button>
                )}
                <Button className="px-2.5 py-1.5" title="Adaugă cont pentru plată" onClick={() => setDialog({ provider: p, mode: 'account' })}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Adaugă</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Legend({ view, cat, hovered }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
      {hovered ? (
        <span className="flex items-center gap-2">
          <Swatch color="var(--map-highlight)" /> Zona acoperită de {hovered.name}
          {hovered.coverage === 'national' && ' (toată țara)'}
        </span>
      ) : view.onlyNational ? (
        <span className="flex items-center gap-2">
          <Swatch color={ALL_NATIONAL} /> {cat ? category(cat).label : 'Furnizorii'} disponibili în toate județele
        </span>
      ) : (
        <>
          <span className="flex items-center gap-2">
            Operatori locali{cat ? ` de ${category(cat).label.toLowerCase()}` : ''}:
            {SCALE.map((c) => (
              <Swatch key={c} color={c} />
            ))}
            <span>1 → {view.maxLocal}</span>
          </span>
          <span className="flex items-center gap-2">
            <Swatch color={NONE} /> niciunul în Pago
          </span>
        </>
      )}
      <span className="flex items-center gap-2">
        <span className="h-0 w-5 border-t-2 border-dashed border-ink" /> județul tău
      </span>
    </div>
  )
}

function Swatch({ color }) {
  return <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
}

function Chip({ active, onClick, color, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? 'bg-brand-600 text-white' : 'bg-surface text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? '#fff' : color }} />}
      {children}
    </button>
  )
}
