import { Mail } from 'lucide-react'
import { AuthShell, PrimaryButton, SecondaryButton } from './AuthLayout'

export default function LoginScreen({ notice, onDemo }) {
  return (
    <AuthShell
      title="Bun venit în Pago"
      subtitle="Conectează-te cu Gmail și îți aducem furnizorii și facturile într-un singur loc."
    >
      {notice && (
        <p role="alert" className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {notice}
        </p>
      )}

      <PrimaryButton href="/api/auth/google/start">
        <Mail className="h-5 w-5" />
        Continuă cu Gmail
      </PrimaryButton>

      <div className="mt-3">
        <SecondaryButton onClick={onDemo}>Intră cu un cont demo</SecondaryButton>
      </div>
    </AuthShell>
  )
}
