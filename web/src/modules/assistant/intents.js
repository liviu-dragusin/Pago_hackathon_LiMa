// Asistentul înțelege comenzi în română fără server și fără cheie API:
// textul e normalizat (fără diacritice, litere mici), apoi fiecare intenție primește un scor
// după cuvintele-cheie găsite. Câștigă scorul cel mai mare.

/** „Du-mă în pagina de facturi!” → „du ma in pagina de facturi” */
export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritice
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Un cuvânt-cheie se potrivește dacă un cuvânt din text începe cu el („factur” → facturi, facturile). */
function hits(words, keys) {
  let n = 0
  for (const k of keys) {
    if (k.includes(' ') ? words.join(' ').includes(k) : words.some((w) => w.startsWith(k))) n++
  }
  return n
}

/*
 * Fiecare intenție:
 *   keys    – rădăcini de cuvinte (fără diacritice); fiecare potrivire = +1 punct
 *   strong  – cuvinte care decid singure intenția (+2 puncte)
 *   resolve – (words) => răspunsul: { text, to?, choices?, action? }
 */
export const INTENTS = [
  {
    id: 'add-provider',
    keys: ['adaug', 'conect', 'contract', 'operator', 'nou'],
    strong: ['furnizor'],
    resolve: (words) => {
      if (hits(words, ['gmail', 'mail', 'email', 'inbox', 'scan'])) {
        return { text: 'Te duc la importul din Gmail: găsim furnizorii din facturile primite pe mail.', to: '/importa' }
      }
      if (hits(words, ['harta', 'judet', 'manual', 'cauta'])) {
        return { text: 'Te duc la hartă: alegi județul, serviciul și apoi furnizorul.', to: '/furnizori' }
      }
      return {
        text: 'Cum vrei să adaugi furnizorii?',
        choices: [
          { label: 'Aleg de pe hartă', to: '/furnizori', hint: 'județ → serviciu → furnizor' },
          { label: 'Îi import din Gmail', to: '/importa', hint: 'găsim facturile din mail' },
        ],
      }
    },
  },
  {
    id: 'gmail',
    keys: ['import', 'scan', 'inbox'],
    strong: ['gmail', 'mail', 'email'],
    resolve: () => ({ text: 'Te duc la importul din Gmail.', to: '/importa' }),
  },
  {
    id: 'bills',
    keys: ['plat', 'scaden', 'restan', 'neplat', 'datorez', 'achit'],
    strong: ['factur'],
    resolve: (words) => {
      if (hits(words, ['restan', 'intarzi', 'depasit'])) return { text: 'Uite facturile restante.', to: '/facturi?status=overdue' }
      if (hits(words, ['neplat', 'de plata', 'scaden', 'urmeaz'])) return { text: 'Uite facturile de plată.', to: '/facturi?status=unpaid' }
      if (hits(words, ['platite', 'achitate', 'istoric'])) return { text: 'Uite facturile plătite.', to: '/facturi?status=paid' }
      return { text: 'Te duc la facturi.', to: '/facturi' }
    },
  },
  {
    id: 'budget',
    keys: ['estim', 'predic', 'prognoz', 'luna viitoare', 'cheltui', 'vreme', 'temperatur', 'frig', 'cat o sa', 'cat voi'],
    strong: ['buget'],
    resolve: () => ({ text: 'Te duc la Buget & Predicții: vezi estimarea pentru luna viitoare, inclusiv după vreme.', to: '/buget' }),
  },
  {
    id: 'split',
    keys: ['impart', 'coleg', 'datoreaz', 'datorii', 'apartament', 'familie'],
    strong: ['split'],
    resolve: () => ({ text: 'Te duc la plățile split: cine ți-a dat banii și cine mai are de dat.', to: '/split' }),
  },
  {
    id: 'home',
    keys: ['acasa', 'dashboard', 'principal', 'inceput', 'sumar', 'rezumat'],
    strong: [],
    resolve: () => ({ text: 'Te duc acasă.', to: '/' }),
  },
  {
    id: 'theme',
    keys: ['tema', 'intunecat', 'luminos', 'dark', 'light', 'noapte'],
    strong: ['dark mode'],
    resolve: () => ({ text: 'Am schimbat tema.', action: 'toggle-theme' }),
  },
  {
    id: 'help',
    keys: ['ajut', 'help', 'ce poti', 'ce stii', 'comenzi', 'cum functionez'],
    strong: [],
    resolve: () => ({ text: 'Îmi poți spune unde vrei să mergi. De exemplu:', suggestions: true }),
  },
]

export const SUGGESTIONS = [
  'Du-mă la facturi',
  'Arată facturile restante',
  'Cum văd estimarea de buget?',
  'Vreau să adaug furnizori',
  'Cine îmi datorează bani?',
]

/** Returnează răspunsul pentru un mesaj sau un răspuns de tip „nu am înțeles”. */
export function answer(text) {
  const words = normalize(text).split(' ').filter(Boolean)
  let best = null
  for (const intent of INTENTS) {
    const score = hits(words, intent.keys) + 2 * hits(words, intent.strong)
    if (score > 0 && (!best || score > best.score)) best = { intent, score }
  }
  if (!best) {
    return { intent: null, text: 'Nu sunt sigur ce vrei. Încearcă una dintre comenzile de mai jos:', suggestions: true }
  }
  return { intent: best.intent.id, ...best.intent.resolve(words) }
}
