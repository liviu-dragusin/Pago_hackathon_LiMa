import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AUTH_MESSAGES, GmailImportPage } from '../gmail-import'
import LoginScreen from './LoginScreen'
import WelcomeScreen from './WelcomeScreen'

// Poarta aplicației: autentificarea se face cu Gmail (backend-ul modulului gmail-import ține sesiunea PHP).
//   neconectat  -> LoginScreen
//   conectat, prima dată -> WelcomeScreen (Detecție automată / Import mai târziu)
//   alegerea făcută -> aplicația, fără importul din meniu
// Alegerea făcută se ține minte în localStorage doar cât timp userul rămâne conectat (ca un refresh să nu
// readucă ecranul). La FIECARE autentificare nouă (Google, cont demo) și la deconectare se resetează, deci după
// o conectare reușită apare mereu ecranul cu „Detecție automată”.

const AuthCtx = createContext({ user: null, logout: () => {} })
export const useAuth = () => useContext(AuthCtx)

async function authCall(path, options = {}) {
  const res = await fetch(`/api/auth${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const flagKey = (email) => `pago.onboarded.${email}`

function readOnboarded(email) {
  try {
    return localStorage.getItem(flagKey(email)) === '1'
  } catch {
    return false
  }
}

function writeOnboarded(email) {
  try {
    localStorage.setItem(flagKey(email), '1')
  } catch {
    // stocare blocată: alegerea ține doar cât sesiunea curentă
  }
}

function clearOnboarded(email) {
  try {
    localStorage.removeItem(flagKey(email))
  } catch {
    // nimic de șters dacă stocarea e blocată
  }
}

export default function AuthGate({ children }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(undefined) // undefined = se verifică, null = neconectat
  const [onboarded, setOnboarded] = useState(false)
  const [phase, setPhase] = useState('welcome') // welcome | importing
  const [notice, setNotice] = useState('')

  // `freshLogin`: tocmai s-a făcut o autentificare, deci alegerea veche (dacă există) nu mai contează.
  const loadUser = useCallback(async ({ freshLogin = false } = {}) => {
    try {
      const me = await authCall('/me')
      if (me.authenticated) {
        if (freshLogin) clearOnboarded(me.email)
        setUser({ email: me.email, demo: Boolean(me.demo) })
        setOnboarded(readOnboarded(me.email))
      } else {
        setUser(null)
      }
    } catch {
      setNotice('Nu mă pot conecta la server. Verifică dacă Apache rulează.')
      setUser(null)
    }
  }, [])

  // La revenirea de la Google, backend-ul redirecționează cu ?auth=ok|denied|...
  useEffect(() => {
    const auth = params.get('auth')
    if (auth) {
      if (auth !== 'ok') setNotice(AUTH_MESSAGES[auth] || 'Conectarea la Gmail a eșuat.')
      navigate('/', { replace: true })
    }
    loadUser({ freshLogin: auth === 'ok' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function demoLogin() {
    setNotice('')
    try {
      await authCall('/demo', { method: 'POST' })
      await loadUser({ freshLogin: true })
    } catch (e) {
      setNotice(e.message)
    }
  }

  async function logout() {
    if (user) clearOnboarded(user.email)
    try {
      await authCall('/logout', { method: 'POST' })
    } catch {
      // sesiunea expiră oricum; ieșim din aplicație
    }
    setUser(null)
    setOnboarded(false)
    setPhase('welcome')
    setNotice('')
    navigate('/', { replace: true })
  }

  function finishOnboarding(path = '/') {
    writeOnboarded(user.email)
    setOnboarded(true)
    setPhase('welcome')
    navigate(path, { replace: true })
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <span
          role="status"
          aria-label="Se încarcă"
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]"
        />
      </div>
    )
  }

  if (user === null) {
    return <LoginScreen notice={notice} onDemo={demoLogin} />
  }

  if (!onboarded) {
    if (phase === 'importing') {
      return (
        <div className="min-h-screen bg-ground px-4 py-8">
          <GmailImportPage
            autoStart={user.demo ? 'demo' : 'live'}
            onExit={(completed) => (completed ? finishOnboarding() : setPhase('welcome'))}
          />
        </div>
      )
    }
    return (
      <WelcomeScreen
        user={user}
        onDetect={() => setPhase('importing')}
        onManual={() => finishOnboarding('/furnizori')}
        onLogout={logout}
      />
    )
  }

  return <AuthCtx.Provider value={{ user, logout }}>{children}</AuthCtx.Provider>
}
