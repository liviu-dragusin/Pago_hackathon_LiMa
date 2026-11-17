// Cadru comun al ecranelor de login / bun venit: aceeași temă ca aplicația (tokeni light/dark),
// cu posterul albastru din restul paginilor.
export function AuthShell({ title, subtitle, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-8">
      <div className="w-full max-w-[480px] space-y-4">
        <div className="flex flex-col items-center gap-3 pb-2 text-center">
          <span className="text-6xl font-bold lowercase leading-none text-[var(--accent)]">pago</span>
          <span className="text-sm text-[var(--muted)]">Echipa LiMa</span>
        </div>

        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div
            className="relative overflow-hidden p-6 text-white"
            style={{ background: 'linear-gradient(160deg, var(--poster-a), var(--poster-b))' }}
          >
            <div
              className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,213,74,.55), transparent 70%)' }}
            />
            <h1 className="relative text-center text-[clamp(26px,5.6vw,34px)] leading-[1.15]" style={{ color: 'var(--poster-yellow)' }}>
              {title}
            </h1>
          </div>
          <div className="p-6">{children}</div>
        </section>
      </div>
    </main>
  )
}

const BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-center font-semibold transition'

export function PrimaryButton({ href, onClick, children }) {
  const cls = `${BUTTON} bg-brand-600 text-white hover:bg-brand-600/90`
  if (href) return <a href={href} className={cls}>{children}</a>
  return <button type="button" onClick={onClick} className={cls}>{children}</button>
}

export function SecondaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${BUTTON} bg-[var(--surface-2)] text-[var(--accent)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]`}
    >
      {children}
    </button>
  )
}

export function TextLink({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-[var(--muted)] underline underline-offset-4 transition hover:text-[var(--ink)]"
    >
      {children}
    </button>
  )
}
