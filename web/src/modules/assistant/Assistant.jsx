import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, MessageCircle, Mic, MicOff, Send, Sparkles, X } from 'lucide-react'
import { useTheme } from '../../lib/theme'
import { SUGGESTIONS, answer } from './intents'

// Asistent de navigare: scrii (sau spui) ce vrei, iar el te duce în pagina potrivită.
// Rulează integral în browser (vezi intents.js); vocea folosește Web Speech API, dacă browserul o are.

const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

const WELCOME = {
  from: 'bot',
  text: 'Salut! Sunt asistentul Pago. Spune-mi unde vrei să mergi sau ce vrei să faci.',
  suggestions: true,
}

export default function Assistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const navigate = useNavigate()
  const { toggle } = useTheme()
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const recRef = useRef(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Esc închide fereastra
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function go(to) {
    navigate(to)
    // pe mobil fereastra acoperă pagina: o închidem după navigare
    if (window.matchMedia?.('(max-width: 639px)').matches) setTimeout(() => setOpen(false), 350)
  }

  function send(text) {
    const q = text.trim()
    if (!q) return
    const reply = answer(q)
    setMessages((m) => [...m, { from: 'user', text: q }, { from: 'bot', ...reply }])
    setInput('')
    if (reply.action === 'toggle-theme') toggle()
    if (reply.to) setTimeout(() => go(reply.to), 450)
  }

  function toggleVoice() {
    if (!SpeechRecognition) return
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'ro-RO'
    rec.interimResults = true
    rec.onresult = (e) => {
      const transcript = [...e.results].map((r) => r[0].transcript).join(' ')
      setInput(transcript)
      if (e.results[e.results.length - 1].isFinal) send(transcript)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  return (
    <>
      {/* Butonul plutitor: deasupra meniului de jos pe mobil */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Închide asistentul' : 'Deschide asistentul'}
        className={`fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 lg:bottom-6 lg:right-6 ${
          open ? 'hidden sm:flex' : 'flex'
        }`}
        style={{ background: 'linear-gradient(160deg, var(--poster-a), var(--poster-b))' }}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Asistent Pago"
          className="fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col bg-surface sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[560px] sm:max-h-[calc(100vh-8rem)] sm:w-[380px] sm:rounded-[24px] sm:border sm:border-line sm:shadow-[var(--shadow)] lg:bottom-24"
        >
          <header
            className="flex items-center gap-3 px-4 py-3.5 text-white sm:rounded-t-[24px]"
            style={{ background: 'linear-gradient(160deg, var(--poster-a), var(--poster-b))' }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Sparkles className="h-5 w-5" style={{ color: 'var(--poster-yellow)' }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">Asistent Pago</p>
              <p className="text-xs text-white/75">Te duc unde ai nevoie</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Închide" className="rounded-full p-1.5 hover:bg-white/15">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((m, i) => (
              <Message key={i} message={m} onGo={go} onSuggest={send} />
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 border-t border-line p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Te ascult…' : 'Ex: du-mă la facturi'}
              className="min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
            />
            {SpeechRecognition && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={listening ? 'Oprește microfonul' : 'Vorbește'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                  listening ? 'animate-pulse bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Trimite"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-600/90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </>
  )
}

function Message({ message, onGo, onSuggest }) {
  if (message.from === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[18px] rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">{message.text}</p>
      </div>
    )
  }
  return (
    <div className="max-w-[92%] space-y-2">
      <p className="rounded-[18px] rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm">{message.text}</p>

      {message.to && (
        <button
          type="button"
          onClick={() => onGo(message.to)}
          className="flex items-center gap-1 px-1 text-xs font-semibold text-brand-600 hover:underline"
        >
          Deschide pagina <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

      {message.choices && (
        <div className="space-y-2">
          {message.choices.map((c) => (
            <button
              key={c.to}
              type="button"
              onClick={() => onGo(c.to)}
              className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="block text-xs text-slate-500">{c.hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      )}

      {message.suggestions && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggest(s)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
