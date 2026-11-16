import { Building2, Droplets, Flame, Package, Radio, Receipt, Smartphone, Trash2, Wifi, Zap } from 'lucide-react'

const ronFmt = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' })
export const ron = (v) => ronFmt.format(v ?? 0)

export const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : '—'

export const monthLabel = (period, opts = { month: 'short', year: '2-digit' }) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('ro-RO', opts)
}

export const CATEGORIES = {
  energie: { label: 'Energie', icon: Zap, color: '#f59e0b' },
  gaz: { label: 'Gaz', icon: Flame, color: '#ef4444' },
  apa: { label: 'Apă', icon: Droplets, color: '#0ea5e9' },
  internet: { label: 'Internet & TV', icon: Wifi, color: '#8b5cf6' },
  telefonie: { label: 'Telefonie', icon: Smartphone, color: '#f97316' },
  intretinere: { label: 'Întreținere', icon: Building2, color: '#10b981' },
  // categorii adăugate din harta furnizorilor (catalogul Pago)
  comunicatii: { label: 'Comunicații', icon: Radio, color: '#8b5cf6' },
  salubrizare: { label: 'Salubrizare', icon: Trash2, color: '#84cc16' },
  diverse: { label: 'Diverse', icon: Package, color: '#64748b' },
}

export const category = (key) => CATEGORIES[key] ?? { label: key, icon: Receipt, color: '#64748b' }

export function dueText(bill) {
  if (bill.status === 'paid') return `Plătită ${shortDate(bill.paid_at)}`
  if (bill.days_left < 0) return `Restantă de ${-bill.days_left} zile`
  if (bill.days_left === 0) return 'Scadentă azi'
  if (bill.days_left === 1) return 'Scadentă mâine'
  return `Scadentă în ${bill.days_left} zile`
}
