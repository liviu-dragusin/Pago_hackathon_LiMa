import { ArrowRight, Zap } from 'lucide-react'
import { AuthShell, SecondaryButton, TextLink } from './AuthLayout'

export default function WelcomeScreen({ user, onDetect, onManual, onLogout }) {
  return (
    <AuthShell
      title="Adu-ți furnizorii într-un singur loc"
      subtitle="Găsim facturile din Gmail și îți propunem furnizorii. Tu alegi ce adaugi."
    >
      <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Conectat ca <b className="truncate font-semibold text-[var(--ink)]">{user.email}</b>
      </p>

      {/* Singurul element în stil „AI” din ecran. */}
      <button type="button" onClick={onDetect} className="ai-btn mt-6">
        <Zap className="h-5 w-5" />
        Detecție automată a furnizorilor
        <ArrowRight className="ml-auto h-5 w-5 opacity-80" />
      </button>
      <div className="mt-3">
        <SecondaryButton onClick={onManual}>Introducere manuală a furnizorilor</SecondaryButton>
      </div>

      <div className="mt-5 text-center">
        <TextLink onClick={onLogout}>Nu ești tu? Deconectare</TextLink>
      </div>
    </AuthShell>
  )
}
