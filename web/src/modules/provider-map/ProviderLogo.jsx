import { useState } from 'react'
import { CategoryIcon } from '../../components/ui'

// Sigla operatorului (din catalog, `logo`); dacă lipsește sau nu se încarcă, cade pe iconița categoriei.
export default function ProviderLogo({ logo, cat, className = 'h-9 w-9' }) {
  const [failed, setFailed] = useState(false)
  if (!logo || failed) {
    return <CategoryIcon cat={cat} size="sm" />
  }
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ${className}`}>
      <img
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </span>
  )
}
