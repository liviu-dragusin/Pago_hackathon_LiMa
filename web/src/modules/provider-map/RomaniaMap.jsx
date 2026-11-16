import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'

// Hartă SVG (d3-geo), fără WebGL / workers / basemap extern: merge oriunde, inclusiv offline la demo.
const W = 800
const H = 560
const NONE = 'var(--map-none)' // culorile vin din index.css și urmează tema

/**
 * Harta României pe județe.
 * @param colors     {COD: '#hex'} culoarea de umplere pe județ
 * @param highlight  coduri de județ evidențiate (ex. acoperirea furnizorului peste care e mouse-ul)
 * @param selected   codul județului selectat
 * @param home       codul județului userului
 * @param onSelect   (code) => void
 */
export default function RomaniaMap({ colors = {}, highlight = [], selected, home, onSelect }) {
  const [geo, setGeo] = useState(null)
  const [hover, setHover] = useState(null) // {code, name, x, y} în procente din container

  useEffect(() => {
    fetch('/geo/judete.geojson')
      .then((r) => r.json())
      .then(setGeo)
  }, [])

  const counties = useMemo(() => {
    if (!geo) return []
    const path = geoPath(geoMercator().fitSize([W, H], geo))
    return geo.features.map((f) => ({
      code: f.properties.code,
      name: f.properties.name,
      d: path(f),
      center: path.centroid(f),
    }))
  }, [geo])

  if (!geo) return <div className="flex h-full items-center justify-center text-sm text-slate-400">Se încarcă harta…</div>

  const byCode = Object.fromEntries(counties.map((c) => [c.code, c]))
  const hl = new Set(highlight)

  return (
    <div className="relative h-full w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Harta județelor din România">
        {counties.map((c) => (
          <path
            key={c.code}
            d={c.d}
            style={{ fill: hl.has(c.code) ? 'var(--map-highlight)' : colors[c.code] ?? NONE, stroke: 'var(--surface)' }}
            strokeWidth={1.2}
            className="cursor-pointer outline-none transition-[fill,opacity] duration-150 hover:opacity-80"
            onClick={() => onSelect?.(c.code)}
            onMouseMove={(e) => {
              const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
              setHover({ ...c, x: e.clientX - box.left, y: e.clientY - box.top })
            }}
          />
        ))}

        {/* contururi: județul tău (punctat) și județul selectat */}
        {home && byCode[home] && (
          <path d={byCode[home].d} fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
        )}
        {selected && byCode[selected] && (
          <path d={byCode[selected].d} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth={3} strokeLinejoin="round" pointerEvents="none" />
        )}

        {/* etichete cu codul județului (București e prea mic pentru etichetă) */}
        {counties.filter((c) => c.code !== 'B').map((c) => (
          <text
            key={c.code}
            x={c.center[0]}
            y={c.center[1]}
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
            className={`select-none text-[11px] font-semibold ${c.code === selected ? 'fill-brand-900' : 'fill-slate-700/70'}`}
          >
            {c.code}
          </text>
        ))}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-surface shadow"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.name}
        </div>
      )}
    </div>
  )
}
