import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileText, Mail, ShieldCheck } from 'lucide-react'

// Portat din modules/gmail-import/frontend (vanilla JS) în React, cu aceleași rute API:
// /api/auth/google/start, /api/scan/start, /api/scan/status, /api/providers/discovered, /api/providers/confirm.
// Cererile sunt trimise prin Vite proxy (vite.config.js), care le duce la backend-ul modulului.

export const AUTH_MESSAGES = {
  denied: 'Ai refuzat accesul la Gmail. Poți încerca din nou sau folosi datele demo.',
  state: 'Sesiunea de autorizare a expirat. Încearcă din nou.',
  norefresh: 'Google nu a returnat o autorizare reînnoibilă. Încearcă din nou și acceptă accesul.',
  error: 'Conectarea la Gmail a eșuat. Verifică configurarea serverului.',
}

async function call(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// Folosită ca pas de onboarding (modules/auth): `autoStart` ('live' | 'demo') pornește scanarea direct,
// iar `onExit(completed)` încheie pasul (true = intră în aplicație, false = înapoi la ecranul de bun venit).
export default function GmailImportPage({ autoStart = null, onExit = null }) {
  const [params, setParams] = useSearchParams()
  // intro | starting | progress | review | empty | done | error
  const [step, setStep] = useState(autoStart ? 'starting' : 'intro')
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [providers, setProviders] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [added, setAdded] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const fail = (msg) => {
    setMessage(msg)
    setStep('error')
  }

  async function startScan(mode) {
    setMessage('')
    setStep('starting')
    try {
      const data = await call('/scan/start', { method: 'POST', body: JSON.stringify({ mode }) })
      setJob(null)
      setJobId(data.job_id)
      setStep('progress')
    } catch (e) {
      fail(e.message)
    }
  }

  async function loadReview(id) {
    try {
      const { providers: list } = await call(`/providers/discovered?job_id=${id}`)
      setProviders(list)
      setSelected(new Set(list.map((p) => p.id)))
      setStep(list.length ? 'review' : 'empty')
    } catch (e) {
      fail(e.message)
    }
  }

  // Revenirea de la Google: /importa/?auth=ok|denied|...
  useEffect(() => {
    const auth = params.get('auth')
    if (!auth) return
    setParams({}, { replace: true })
    if (auth === 'ok') startScan('live')
    else fail(AUTH_MESSAGES[auth] || 'Conectarea la Gmail a eșuat.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pornit din onboarding: scanarea începe direct, fără pasul de introducere.
  useEffect(() => {
    if (autoStart) startScan(autoStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling pe progresul scanării.
  useEffect(() => {
    if (step !== 'progress' || !jobId) return
    let cancelled = false
    const tick = async () => {
      try {
        const j = await call(`/scan/status?id=${jobId}`)
        if (cancelled) return
        setJob(j)
        if (j.status === 'done') {
          cancelled = true
          loadReview(jobId)
        } else if (j.status === 'error') {
          cancelled = true
          fail(j.error || 'Scanarea a eșuat.')
        }
      } catch (e) {
        if (!cancelled) {
          cancelled = true
          fail(e.message)
        }
      }
    }
    tick()
    const timer = setInterval(tick, 600)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jobId])

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function confirm() {
    setBusy(true)
    setMessage('')
    try {
      const data = await call('/providers/confirm', {
        method: 'POST',
        body: JSON.stringify({ job_id: jobId, ids: [...selected] }),
      })
      setAdded(data.added)
      setStep('done')
    } catch (e) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    if (onExit) {
      onExit(false)
      return
    }
    setJobId(null)
    setJob(null)
    setProviders([])
    setSelected(new Set())
    setMessage('')
    setStep('intro')
  }

  return (
    <div className="mx-auto max-w-[880px] space-y-7">
      <Hero />

      {step === 'intro' && <Intro onDemo={() => startScan('demo')} />}
      {step === 'starting' && <Panel><p className="text-[var(--muted)]">Pornim scanarea…</p></Panel>}
      {step === 'progress' && <Progress job={job} />}
      {step === 'review' && (
        <Review
          providers={providers}
          selected={selected}
          onToggle={toggle}
          onConfirm={confirm}
          busy={busy}
          message={message}
          onSkip={onExit ? () => onExit(true) : null}
        />
      )}
      {step === 'empty' && (
        <Panel>
          <p className="font-semibold">Nu am găsit facturi noi</p>
          <p className="mt-2 text-[var(--muted)]">Poți adăuga furnizorii manual din catalogul Pago.</p>
          <Action onClick={restart} secondary>Înapoi</Action>
        </Panel>
      )}
      {step === 'done' && (
        <Panel>
          <div className="flex items-start gap-4">
            <IconBox><CheckCircle2 className="h-6 w-6" /></IconBox>
            <div>
              <p className="text-lg font-bold">Gata! Ai adăugat {added} {added === 1 ? 'furnizor' : 'furnizori'}</p>
              <p className="mt-1 text-[var(--muted)]">Facturile lor vor apărea în Pago, cu scadențele urmărite automat.</p>
            </div>
          </div>
          {onExit ? <Action onClick={() => onExit(true)}>Intră în aplicație</Action> : <Action href="/">Mergi la acasă</Action>}
        </Panel>
      )}
      {step === 'error' && (
        <Panel>
          <p className="font-semibold text-red-600">{message || 'Scanarea a eșuat.'}</p>
          <Action onClick={restart} secondary>Înapoi</Action>
        </Panel>
      )}
    </div>
  )
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden rounded-[28px] p-7 text-white"
      style={{ background: 'linear-gradient(160deg, var(--poster-a), var(--poster-b))' }}
    >
      <div
        className="pointer-events-none absolute -bottom-12 -right-12 h-56 w-56 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,213,74,.55), transparent 70%)' }}
      />
      <p className="relative text-sm font-semibold opacity-90">Pago · Bun venit</p>
      <h1
        className="relative mt-2 text-[clamp(30px,5.2vw,46px)] leading-[1.1]"
        style={{ color: 'var(--poster-yellow)' }}
      >
        Adu-ți furnizorii într-un singur loc
      </h1>
      <p className="relative mt-3 max-w-md font-semibold">
        Găsim facturile din Gmail și îți propunem furnizorii. Tu alegi ce adaugi.
      </p>
    </section>
  )
}

function Panel({ children }) {
  return (
    <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
      {children}
    </section>
  )
}

function Intro({ onDemo }) {
  return (
    <Panel>
      <div className="flex items-start gap-4">
        <IconBox><Mail className="h-6 w-6" /></IconBox>
        <div className="flex-1">
          <p className="font-semibold">Conectează Gmail-ul o singură dată</p>
          <p className="mt-1 text-[var(--muted)]">
            Scanăm facturile din ultimele 12 luni și îți propunem furnizorii. Tu alegi ce adaugi.
          </p>
        </div>
      </div>
      <Action href="/api/auth/google/start">Conectează Gmail</Action>
      <p className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
        <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
        Acces doar la citire. Revocăm accesul imediat după scanare.
      </p>
      <Action onClick={onDemo} secondary>Încearcă cu date demo</Action>
    </Panel>
  )
}

function Progress({ job }) {
  const total = job?.total_emails ?? 0
  const processed = job?.processed ?? 0
  const pct = total ? Math.round((processed * 100) / total) : 0
  const detected = job?.detected ?? []
  return (
    <Panel>
      <div className="flex flex-col items-center text-center">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full text-[var(--accent)]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent-soft)]" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)]">
            <Mail className="h-7 w-7" />
          </span>
        </span>
        <p className="mt-4 font-semibold">Caut facturile tale…</p>
        <div className="mt-4 h-3 w-full max-w-sm overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {processed} din {total} emailuri verificate
        </p>

        <ul className="mt-5 flex w-full max-w-sm flex-col items-center gap-2" aria-live="polite">
          {detected.map((d) => (
            <li
              key={d.name}
              className="pago-pop flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--surface-2)] px-4 py-2.5 ring-1 ring-[var(--line)]"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--accent)]" />
              <span className="truncate font-semibold">{d.name}</span>
              <span className="shrink-0 text-sm text-[var(--muted)]">detectat{d.category ? ` · ${d.category}` : ''}</span>
            </li>
          ))}
        </ul>
        {detected.length === 0 && <p className="mt-5 text-sm text-[var(--muted)]">Încă niciun furnizor detectat…</p>}
      </div>
    </Panel>
  )
}

function Review({ providers, selected, onToggle, onConfirm, busy, message, onSkip }) {
  return (
    <Panel>
      <p className="font-semibold">Am găsit {providers.length} furnizori în emailurile tale</p>
      <p className="mt-1 text-sm text-[var(--muted)]">Bifează-i pe cei pe care vrei să îi adaugi în Pago.</p>

      <div className="mt-4 space-y-2">
        {providers.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer gap-3 rounded-[14px] border border-[var(--line)] p-3 hover:bg-[var(--surface-2)]"
          >
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[var(--accent)]"
              checked={selected.has(p.id)}
              onChange={() => onToggle(p.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold">{p.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    p.catalog_id ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {p.catalog_id ? 'din catalog Pago' : 'furnizor nou'}
                </span>
              </span>
              <span className="mt-1 block text-sm text-[var(--muted)]">
                {p.category || 'altele'}
                {p.client_code ? ` · cod client ${p.client_code}` : ''}
              </span>
              <span className="mt-1 block text-sm">
                Ultima factură: <b>{p.last_amount != null ? Number(p.last_amount).toFixed(2) : '–'} {p.currency || 'RON'}</b>
                {p.last_due_date ? ` · scadentă ${p.last_due_date}` : ''}
                {` · ${p.invoice_count} ${p.invoice_count === 1 ? 'factură' : 'facturi'}`}
              </span>
              {p.iban && !p.iban_valid && (
                <span className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> IBAN-ul din factură nu s-a putut verifica. Confirmă-l înainte de plată.
                </span>
              )}
            </span>
            {p.has_invoice_pdf && (
              <button
                type="button"
                onClick={(e) => {
                  // Butonul e în interiorul <label>: nu vrem să bifeze și checkbox-ul.
                  e.preventDefault()
                  e.stopPropagation()
                  window.open(`/api/providers/invoice?id=${p.id}`, '_blank', 'noopener')
                }}
                className="flex shrink-0 items-center gap-1.5 self-start rounded-[10px] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--accent)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]"
              >
                <FileText className="h-4 w-4" /> Factură PDF
              </button>
            )}
          </label>
        ))}
      </div>

      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      <Action onClick={onConfirm} disabled={busy || selected.size === 0}>
        {busy ? 'Se salvează…' : `Adaugă furnizorii selectați (${selected.size})`}
      </Action>
      {onSkip && <Action onClick={onSkip} secondary>Sari peste, intru în aplicație</Action>}
    </Panel>
  )
}

function IconBox({ children }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent)]">
      {children}
    </span>
  )
}

function Action({ href, onClick, secondary = false, disabled = false, children }) {
  const base =
    'mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-center font-semibold transition disabled:opacity-50'
  const style = secondary
    ? `${base} bg-[var(--surface-2)] text-[var(--accent)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]`
    : `${base} bg-[var(--accent)] text-white hover:opacity-90`
  if (href) return <a href={href} className={style}>{children}</a>
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={style}>
      {children}
    </button>
  )
}
