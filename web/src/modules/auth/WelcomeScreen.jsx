import { ArrowRight, Eye, Lock, ShieldCheck, Zap } from 'lucide-react'
import { AuthShell, SecondaryButton, TextLink } from './AuthLayout'

const PERKS = [
  { icon: Eye, label: 'Doar citire' },
  { icon: Lock, label: 'Acces revocat după scanare' },
  { icon: ShieldCheck, label: 'Tu confirmi ce adaugi' },
]

export default function WelcomeScreen({ user, onDetect, onLater, onLogout }) {
  return (
    <AuthShell
      title="Adu-ți furnizorii într-un singur loc"
      subtitle="Găsim facturile din Gmail și îți propunem furnizorii. Tu alegi ce adaugi."
    >
      <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Conectat ca <b className="truncate font-semibold text-[var(--ink)]">{user.email}</b>
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {PERKS.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--muted)] ring-1 ring-[var(--line)]"
          >
            <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
            {label}
          </li>
        ))}
      </ul>

      {/* Singurul element în stil „AI” din ecran. */}
      <button type="button" onClick={onDetect} className="ai-btn mt-6">
        <Zap className="h-5 w-5" />
        Detecție automată a furnizorilor
        <ArrowRight className="ml-auto h-5 w-5 opacity-80" />
      </button>
      <div className="mt-3">
        <SecondaryButton onClick={onLater}>Import mai târziu</SecondaryButton>
      </div>

      <div className="mt-5 text-center">
        <TextLink onClick={onLogout}>Nu ești tu? Deconectare</TextLink>
      </div>
    </AuthShell>
  )
}
