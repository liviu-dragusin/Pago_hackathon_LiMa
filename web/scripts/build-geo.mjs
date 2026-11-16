/**
 * Construiește poligoanele județelor din geojson-ul cu UAT-uri (maxp_result.geojson).
 *
 *   node scripts/build-geo.mjs "C:/Users/.../harta/maxp_result.geojson"
 *
 * Output:
 *   web/public/geo/judete.geojson   — 42 de poligoane (dissolve pe "judet" + simplificare), cu {code, name}
 *   api/data/catalog/localities.json     — {COD_JUDET: [localități...]} pentru formularul de contract
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mapshaper from 'mapshaper'

const src = process.argv[2]
if (!src || !fs.existsSync(src)) {
  console.error('Folosire: node scripts/build-geo.mjs <cale/maxp_result.geojson>')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const counties = JSON.parse(fs.readFileSync(path.join(root, 'api/data/catalog/counties.json'), 'utf8'))
const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace('MUNICIPIUL ', '').trim()
const codeByName = Object.fromEntries(counties.map((c) => [strip(c.name), c.code]))
const codeOf = (judet) => {
  const code = codeByName[strip(judet)]
  if (!code) throw new Error(`Județ necunoscut: ${judet}`)
  return code
}

// 1. Poligoane județe
const out = await mapshaper.applyCommands(
  `-i input.geojson -dissolve judet -simplify 4% keep-shapes -o judete.geojson precision=0.0001`,
  { 'input.geojson': fs.readFileSync(src, 'utf8') },
)
const geo = JSON.parse(out['judete.geojson'])

// d3-geo vrea inelul exterior în sens orar (altfel desenează "tot globul minus județul").
const signedArea = (ring) => ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length]
  return s + (x1 * y2 - x2 * y1)
}, 0)
const rewindPolygon = (rings) => rings.map((r, i) => ((i === 0) === signedArea(r) > 0 ? [...r].reverse() : r))
for (const f of geo.features) {
  const g = f.geometry
  g.coordinates = g.type === 'Polygon' ? rewindPolygon(g.coordinates) : g.coordinates.map(rewindPolygon)
}

for (const f of geo.features) {
  const code = codeOf(f.properties.judet)
  f.properties = { code, name: counties.find((c) => c.code === code).name }
}
fs.mkdirSync(path.join(root, 'web/public/geo'), { recursive: true })
fs.writeFileSync(path.join(root, 'web/public/geo/judete.geojson'), JSON.stringify(geo))

// 2. Localități pe județ
const uats = JSON.parse(fs.readFileSync(src, 'utf8'))
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
const localities = {}
for (const f of uats.features) {
  const code = codeOf(f.properties.judet)
  ;(localities[code] ??= []).push(titleCase(f.properties.denumire).replace(/^(Municipiul|Oraș) /, ''))
}
for (const k of Object.keys(localities)) localities[k] = [...new Set(localities[k])].sort((a, b) => a.localeCompare(b, 'ro'))
fs.writeFileSync(path.join(root, 'api/data/catalog/localities.json'), JSON.stringify(localities))

const kb = (p) => (fs.statSync(path.join(root, p)).size / 1024).toFixed(0) + ' KB'
console.log(`judete.geojson: ${geo.features.length} județe, ${kb('web/public/geo/judete.geojson')}`)
console.log(`localities.json: ${Object.values(localities).flat().length} localități, ${kb('api/data/catalog/localities.json')}`)
