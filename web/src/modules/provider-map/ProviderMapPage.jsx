import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Droplets,
  FileSignature,
  Flame,
  Home,
  MapPin,
  Package,
  Plus,
  Search,
  Trash2,
  Tv,
  Zap,
} from 'lucide-react'
import { ErrorBox, Loading } from '../../components/ui'
import { api, useApi } from '../../lib/api'
import { category } from '../../lib/format'
import AddProviderDialog from './AddProviderDialog'
import ProviderLogo from './ProviderLogo'
import RomaniaMap from './RomaniaMap'

/*
 * Wizard „Adaugă furnizor”, câte un pas pe ecran:
 *   1. Județul   – alegi pe hartă (sau din listă), apoi Continuă
 *   2. Serviciul – curent, gaz, apă, TV…; click pe serviciu te duce mai departe
 *   3. Furnizorul – alegi operatorul și decizi: adaugi contul existent sau ceri contract nou
 */

const NEUTRAL = 'var(--map-2)'
const SELECTED = 'var(--poster-yellow)' // județul ales iese în evidență în ambele teme

// Etichete prietenoase pentru serviciile din catalog
const SERVICES = {
  energie: { label: 'Curent', icon: Zap },
  gaz: { label: 'Gaz', icon: Flame },
  apa: { label: 'Apă', icon: Droplets },
  comunicatii: { label: 'TV & Internet', icon: Tv },
  salubrizare: { label: 'Salubrizare', icon: Trash2 },
  intretinere: { label: 'Întreținere', icon: Building2 },
  diverse: { label: 'Altele', icon: Package },
}
const service = (key) => SERVICES[key] ?? { label: category(key).label, icon: Package }

const countyName = (c) => (c.code === 'B' ? 'București' : c.name)
const countyTitle = (c) => (c.code === 'B' ? 'Municipiul București' : `Județul ${c.name}`)

export default function ProviderMapPage() {
  const { data, loading, error, reload } = useApi(api.catalog)
  const [step, setStep] = useState(1)
  const [countyCode, setCountyCode] = useState(null)
  const [cat, setCat] = useState('')
  const [slug, setSlug] = useState(null)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState(null) // {provider, mode}
  const decisionRef = useRef(null)

  const view = useMemo(() => {
    if (!data) return null
    const county = data.counties.find((c) => c.code === countyCode) ?? null
    const availableIn = (p, code) => p.coverage === 'national' || p.coverage.includes(code)

    const colors = Object.fromEntries(data.counties.map((c) => [c.code, NEUTRAL]))
    if (countyCode) colors[countyCode] = SELECTED

    const serviceCounts = county
      ? Object.fromEntries(
          data.categories.map((c) => [c.key, data.providers.filter((p) => p.categories.includes(c.key) && availableIn(p, county.code)).length]),
        )
      : {}

    const q = query.trim().toLowerCase()
    const operators =
      county && cat
        ? data.providers
            .filter((p) => p.categories.includes(cat) && availableIn(p, county.code) && (!q || p.name.toLowerCase().includes(q)))
            // operatorii locali întâi: sunt cei specifici zonei
            .sort((a, b) => (a.coverage === 'national') - (b.coverage === 'national') || a.name.localeCompare(b.name, 'ro'))
        : []

    return {
      county,
      colors,
      serviceCounts,
      operators,
      selected: data.providers.find((p) => p.slug === slug) ?? null,
      connected: new Set(data.accounts.map((a) => a.slug).filter(Boolean)),
      pending: new Set(data.contracts.filter((c) => ['trimisa', 'in_analiza'].includes(c.status)).map((c) => c.provider_slug)),
    }
  }, [data, countyCode, cat, slug, query])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const canContract = (p) => p.categories.some((c) => data.categories.find((k) => k.key === c)?.contract)
  const homeCounty = data.counties.find((c) => c.code === data.home_county)

  function goTo(n) {
    if (n === 1) {
      setCat('')
      setSlug(null)
    }
    if (n === 2) setSlug(null)
    setQuery('')
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function chooseService(key) {
    setCat(key)
    setSlug(null)
    setQuery('')
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function chooseProvider(p) {
    setSlug(p.slug)
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  return (
    <div className={`mx-auto space-y-6 ${step === 1 ? '' : 'max-w-5xl'}`}>
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl tracking-tight">Adaugă furnizor</h1>
          <p className="mt-1 text-sm text-slate-500">Trei pași simpli: unde locuiești, ce serviciu cauți și cu cine vrei să lucrezi.</p>
        </div>
        <Stepper step={step} onStep={goTo} county={view.county} cat={cat} />
      </header>

      {/* ───────── Pasul 1: harta ───────── */}
      {step === 1 && (
        // harta e vedeta pasului: ocupă toată lățimea paginii, fără padding lateral
        // overflow-clip, nu hidden: hidden ar strica bara sticky de jos
        <section className="overflow-clip rounded-[24px] border border-line bg-surface shadow-[var(--shadow)]">
          <div className="flex flex-col gap-4 px-5 pt-5 sm:px-7 sm:pt-7 xl:flex-row xl:items-end xl:justify-between">
          <StepTitle n={1} title="Unde locuiești?" subtitle="Apasă pe județul tău pe hartă sau alege-l din listă." className="mb-0" />

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={countyCode ?? ''}
              onChange={(e) => setCountyCode(e.target.value || null)}
              aria-label="Alege județul din listă"
              className="rounded-full border border-line bg-surface px-4 py-2 text-sm"
            >
              <option value="">Alege din listă…</option>
              {[...data.counties]
                .sort((a, b) => countyName(a).localeCompare(countyName(b), 'ro'))
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {countyName(c)}
                  </option>
                ))}
            </select>
            {homeCounty && countyCode !== homeCounty.code && (
              <button
                type="button"
                onClick={() => setCountyCode(homeCounty.code)}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                <Home className="h-4 w-4" /> Județul meu ({countyName(homeCounty)})
              </button>
            )}
          </div>
          </div>

          {/* harta încape întreagă pe ecran, centrată: înălțimea = ecranul minus antet, pași și bara de jos */}
          <div className="mt-5 aspect-[10/7] w-full border-y border-line bg-surface-2 px-1 py-2 sm:aspect-auto sm:h-[max(380px,calc(100dvh-430px))] sm:px-6 sm:py-5 lg:h-[max(320px,calc(100dvh-450px))] xl:h-[max(340px,calc(100dvh-400px))]">
            <RomaniaMap colors={view.colors} selected={countyCode} home={data.home_county} onSelect={setCountyCode} />
          </div>

          {/* bara rămâne lipită jos pe ecran, deci „Continuă” e mereu la îndemână */}
          <div className="sticky bottom-16 z-10 flex items-center justify-between gap-4 border-t border-line bg-surface/95 py-4 pl-5 pr-20 backdrop-blur sm:pl-7 lg:bottom-0 lg:pr-24">
            <div className="min-w-0">
              {view.county ? (
                <>
                  <p className="flex items-center gap-2 font-semibold">
                    <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <span className="truncate">{countyTitle(view.county)}</span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Niciun județ ales încă.</p>
              )}
            </div>
            <PrimaryButton disabled={!view.county} onClick={() => goTo(2)}>
              Continuă <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </section>
      )}

      {/* ───────── Pasul 2: serviciul ───────── */}
      {step === 2 && view.county && (
        <WizardCard>
          <StepTitle n={2} title={`Ce serviciu cauți în ${countyName(view.county)}?`} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {data.categories.map((c) => {
              const n = view.serviceCounts[c.key] ?? 0
              const { label, icon: Icon } = service(c.key)
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={n === 0}
                  onClick={() => chooseService(c.key)}
                  className="group flex flex-col items-start gap-4 rounded-[20px] border border-line bg-surface-2 p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:shadow-[var(--shadow)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-line disabled:hover:bg-surface-2 disabled:hover:shadow-none"
                >
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-[14px] text-white"
                    style={{ backgroundColor: category(c.key).color }}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="w-full">
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {label}
                      <ArrowRight className="h-4 w-4 text-slate-400 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </span>
                    <span className="block text-xs text-slate-500">
                      {n === 0 ? 'Niciun furnizor aici' : `${n} ${n === 1 ? 'furnizor' : 'furnizori'}`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <WizardFooter>
            <BackButton onClick={() => goTo(1)}>Alt județ</BackButton>
            <span className="text-xs text-slate-500">Pasul 2 din 3</span>
          </WizardFooter>
        </WizardCard>
      )}

      {/* ───────── Pasul 3: furnizorul și decizia ───────── */}
      {step === 3 && view.county && cat && (
        <WizardCard>
          <StepTitle
            n={3}
            title={`Alege furnizorul de ${service(cat).label.toLowerCase()}`}
            subtitle={`${view.operators.length} ${view.operators.length === 1 ? 'furnizor disponibil' : 'furnizori disponibili'} în ${countyName(view.county)}`}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <label className="relative mb-3 block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Caută furnizor…"
                  className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none"
                />
              </label>

              {view.operators.length === 0 ? (
                <p className="rounded-[16px] border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Niciun furnizor nu se potrivește cu „{query}”.
                </p>
              ) : (
                <ul className="space-y-2 lg:max-h-[460px] lg:overflow-y-auto lg:pr-1" role="radiogroup" aria-label="Furnizori">
                  {view.operators.map((p) => {
                    const active = slug === p.slug
                    return (
                      <li key={p.slug}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => chooseProvider(p)}
                          className={`flex w-full items-center gap-3 rounded-[16px] border p-3 text-left transition ${
                            active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line hover:border-brand-300 hover:bg-slate-50'
                          }`}
                        >
                          <ProviderLogo logo={p.logo} cat={p.categories[0]} className="h-11 w-11" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 font-semibold">
                              <span className="truncate">{p.name}</span>
                              {view.connected.has(p.slug) && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {p.coverage === 'national' ? 'Disponibil în toată țara' : p.area ?? `Operator local · ${countyName(view.county)}`}
                            </span>
                          </span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                              active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'
                            }`}
                          >
                            {active && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div ref={decisionRef} className="scroll-mt-20 lg:sticky lg:top-6 lg:self-start">
              <Decision
                provider={view.selected}
                county={view.county}
                connected={view.selected && view.connected.has(view.selected.slug)}
                pending={view.selected && view.pending.has(view.selected.slug)}
                canContract={view.selected && canContract(view.selected)}
                onChoose={(mode) => setDialog({ provider: view.selected, mode })}
              />
            </div>
          </div>

          <WizardFooter>
            <BackButton onClick={() => goTo(2)}>Alt serviciu</BackButton>
            <span className="text-xs text-slate-500">Pasul 3 din 3</span>
          </WizardFooter>
        </WizardCard>
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

/* ───────── piese de wizard ───────── */

function Stepper({ step, onStep, county, cat }) {
  const steps = [
    { label: 'Județul', value: county ? countyName(county) : null },
    { label: 'Serviciul', value: cat ? service(cat).label : null },
    { label: 'Furnizorul', value: null },
  ]
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((s, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li key={s.label}>
            <button
              type="button"
              disabled={!done}
              onClick={() => onStep(n)}
              className={`flex w-full items-center gap-2 rounded-[16px] border px-2 py-2 text-left transition sm:gap-2.5 sm:px-3 sm:py-2.5 ${
                current
                  ? 'border-brand-500 bg-surface shadow-[var(--shadow)]'
                  : done
                    ? 'border-line bg-surface hover:border-brand-300'
                    : 'border-transparent bg-slate-100'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  current ? 'bg-brand-600 text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span className="min-w-0">
                <span className={`hidden text-[11px] font-semibold uppercase tracking-wider sm:block ${current ? 'text-[var(--accent)]' : 'text-slate-500'}`}>
                  Pasul {n}
                </span>
                <span className={`block truncate text-xs font-semibold sm:text-sm ${current || done ? '' : 'text-slate-400'}`}>
                  {done && s.value ? s.value : s.label}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function WizardCard({ children }) {
  return <section className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-7">{children}</section>
}

function StepTitle({ n, title, subtitle, className = 'mb-5' }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Pasul {n} din 3</p>
      <h2 className="mt-1 text-[clamp(20px,2.6vw,26px)] leading-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

// sticky: pe mobil butonul principal rămâne vizibil deasupra meniului de jos
function WizardFooter({ children, sticky = false }) {
  return (
    <div
      className={`mt-6 flex items-center justify-between gap-4 border-t border-line pt-5 ${
        sticky ? 'sticky bottom-16 z-10 -mx-5 bg-surface px-5 pb-4 sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:px-0 lg:pb-0' : ''
      }`}
    >
      {children}
    </div>
  )
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className="flex shrink-0 items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
    >
      {children}
    </button>
  )
}

function BackButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-line transition hover:bg-slate-50"
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </button>
  )
}

function Decision({ provider, county, connected, pending, canContract, onChoose }) {
  if (!provider) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-300 bg-surface-2 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-50 text-brand-600">
          <Building2 className="h-6 w-6" />
        </span>
        <p className="mt-3 font-semibold">Alege un furnizor</p>
        <p className="mt-1 text-sm text-slate-500">Apoi decizi: adaugi contul pe care îl ai deja sau ceri un contract nou.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[20px] border border-line bg-surface-2 p-5">
      <div className="flex items-center gap-3">
        <ProviderLogo logo={provider.logo} cat={provider.categories[0]} className="h-12 w-12" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{provider.name}</p>
          <p className="truncate text-xs text-slate-500">
            {provider.categories.map((c) => service(c).label).join(' + ')} ·{' '}
            {provider.coverage === 'national' ? 'toată țara' : countyName(county)}
          </p>
        </div>
      </div>

      {(connected || pending) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {connected && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Ai deja un cont conectat</span>}
          {pending && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">Cerere de contract în curs</span>}
        </div>
      )}

      <p className="mt-5 text-sm font-semibold">Ce vrei să faci?</p>
      <div className="mt-2 space-y-2">
        <DecisionOption
          icon={Plus}
          title="Am deja contract"
          text="Adaug codul de client și plătesc facturile din Pago."
          onClick={() => onChoose('account')}
          primary
        />
        {canContract && (
          <DecisionOption
            icon={FileSignature}
            title="Vreau contract nou"
            text={`Trimit o cerere către ${provider.name} pentru adresa mea.`}
            onClick={() => onChoose('contract')}
          />
        )}
      </div>
    </div>
  )
}

function DecisionOption({ icon: Icon, title, text, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-[16px] p-3.5 text-left transition hover:-translate-y-0.5 ${
        primary ? 'bg-brand-600 text-white hover:bg-brand-600/90' : 'border border-line bg-surface hover:border-brand-300'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${
          primary ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className={`block text-xs ${primary ? 'text-white/80' : 'text-slate-500'}`}>{text}</span>
      </span>
      <ArrowRight className={`h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 ${primary ? 'text-white' : 'text-slate-400'}`} />
    </button>
  )
}
